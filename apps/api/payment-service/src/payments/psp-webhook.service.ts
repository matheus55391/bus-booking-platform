import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CheckoutSagaStatus, PaymentStatus, Prisma } from '@bus/payment-prisma';
import { PspWebhookStatus, type PspWebhookInput } from '@repo/common';
import { RoutingKeys } from '@repo/events';
import { createCounter, createLogger } from '@repo/observability';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { CheckoutSagaService } from './checkout-saga.service';
import {
  newTransactionId,
  toPaymentApprovedEvent,
  toPaymentFailedEvent,
  toPspWebhookResponse,
} from './payments.mappers';

const webhooksTotal = createCounter(
  'payment_psp_webhooks_total',
  'Webhooks PSP processados',
  ['result'],
);

/**
 * Handler idempotente de callback do PSP.
 * Dedupe por providerEventId; transição só PENDING → APPROVED|FAILED.
 */
@Injectable()
export class PspWebhookService {
  private readonly log = createLogger('psp-webhook');

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly checkoutSaga: CheckoutSagaService,
  ) {}

  async handle(input: PspWebhookInput) {
    const providerEventId = input.providerEventId?.trim();
    const paymentId = input.paymentId?.trim();
    const status = input.status;
    const provider = (input.provider ?? 'mock').trim() || 'mock';

    if (!providerEventId) {
      throw new BadRequestException('providerEventId is required');
    }
    if (!paymentId) {
      throw new BadRequestException('paymentId is required');
    }
    if (
      status !== PspWebhookStatus.Approved &&
      status !== PspWebhookStatus.Failed
    ) {
      throw new BadRequestException(
        `status must be ${PspWebhookStatus.Approved} or ${PspWebhookStatus.Failed}`,
      );
    }

    const existingHook = await this.prisma.pspWebhookEvent.findUnique({
      where: { providerEventId },
    });
    if (existingHook) {
      webhooksTotal.inc({ result: 'idempotent' });
      const payment = await this.prisma.payment.findUnique({
        where: { id: existingHook.paymentId },
      });
      return toPspWebhookResponse({
        providerEventId,
        paymentId: existingHook.paymentId,
        paymentStatus: payment?.status ?? null,
        idempotentReplay: true,
      });
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) {
      throw new NotFoundException(`payment ${paymentId} not found`);
    }

    if (payment.status === PaymentStatus.APPROVED) {
      await this.recordWebhook(
        providerEventId,
        provider,
        paymentId,
        status,
        input,
      );
      webhooksTotal.inc({ result: 'already_approved' });
      return toPspWebhookResponse({
        providerEventId,
        paymentId,
        paymentStatus: payment.status,
        idempotentReplay: true,
      });
    }

    if (payment.status === PaymentStatus.FAILED) {
      await this.recordWebhook(
        providerEventId,
        provider,
        paymentId,
        status,
        input,
      );
      webhooksTotal.inc({ result: 'already_failed' });
      return toPspWebhookResponse({
        providerEventId,
        paymentId,
        paymentStatus: payment.status,
        idempotentReplay: true,
      });
    }

    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException(
        `payment is ${payment.status}, expected PENDING`,
      );
    }

    try {
      await this.prisma.pspWebhookEvent.create({
        data: {
          providerEventId,
          provider,
          paymentId,
          status,
          payload: input as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        webhooksTotal.inc({ result: 'idempotent' });
        return toPspWebhookResponse({
          providerEventId,
          paymentId,
          paymentStatus: payment.status,
          idempotentReplay: true,
        });
      }
      throw error;
    }

    if (status === PspWebhookStatus.Approved) {
      await this.approve(payment, input.transactionId);
      webhooksTotal.inc({ result: 'approved' });
    } else {
      await this.fail(payment, input.failureReason ?? 'psp_declined');
      webhooksTotal.inc({ result: 'failed' });
    }

    const fresh = await this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });

    this.log.info('psp_webhook_applied', {
      providerEventId,
      paymentId,
      status: fresh.status,
    });

    return toPspWebhookResponse({
      providerEventId,
      paymentId,
      paymentStatus: fresh.status,
      idempotentReplay: false,
    });
  }

  private async recordWebhook(
    providerEventId: string,
    provider: string,
    paymentId: string,
    status: string,
    input: PspWebhookInput,
  ) {
    try {
      await this.prisma.pspWebhookEvent.create({
        data: {
          providerEventId,
          provider,
          paymentId,
          status,
          payload: input as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }
  }

  private async approve(
    payment: {
      id: string;
      reservationId: string;
      amountCents: number;
    },
    transactionId?: string,
  ) {
    const txn = transactionId?.trim() || newTransactionId();
    const event = toPaymentApprovedEvent({
      paymentId: payment.id,
      reservationId: payment.reservationId,
      amountCents: payment.amountCents,
      transactionId: txn,
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: {
          status: PaymentStatus.APPROVED,
          transactionId: txn,
        },
      });
      if (result.count === 0) {
        return null;
      }
      await this.outbox.enqueue(
        tx,
        RoutingKeys.PaymentApproved,
        event,
        event.eventId,
      );
      return result;
    });

    if (!updated) {
      return;
    }
    this.outbox.kickRelay();
    await this.markSaga(payment.id, CheckoutSagaStatus.COMPLETED);
  }

  private async fail(
    payment: { id: string; reservationId: string },
    reason: string,
  ) {
    const event = toPaymentFailedEvent({
      paymentId: payment.id,
      reservationId: payment.reservationId,
      reason,
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: {
          status: PaymentStatus.FAILED,
          failureReason: reason.slice(0, 500),
        },
      });
      if (result.count === 0) {
        return null;
      }
      await this.outbox.enqueue(
        tx,
        RoutingKeys.PaymentFailed,
        event,
        event.eventId,
      );
      return result;
    });

    if (!updated) {
      return;
    }
    this.outbox.kickRelay();

    const saga = await this.prisma.checkoutSaga.findFirst({
      where: { paymentId: payment.id },
      orderBy: { createdAt: 'desc' },
    });
    if (saga) {
      await this.checkoutSaga.compensateFromWebhook(
        saga.id,
        payment.reservationId,
        reason,
      );
    }
  }

  private async markSaga(paymentId: string, status: CheckoutSagaStatus) {
    await this.prisma.checkoutSaga.updateMany({
      where: { paymentId },
      data: { status },
    });
  }
}
