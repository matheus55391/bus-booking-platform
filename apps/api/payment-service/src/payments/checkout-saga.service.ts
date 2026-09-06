import { Injectable } from '@nestjs/common';
import {
  CheckoutSagaStatus,
  Payment,
  PaymentStatus,
  Prisma,
} from '@bus/payment-prisma';
import {
  ReservationStatus,
  type CreatePaymentInput,
  type Reservation,
} from '@repo/common';
import { RoutingKeys } from '@repo/events';
import { createCounter, createLogger } from '@repo/observability';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { BookingClient } from './booking.client';
import {
  newTransactionId,
  toPaymentApprovedEvent,
  toPaymentFailedEvent,
  toPaymentResponse,
} from './payments.mappers';
import { assertSagaInput, errorMessage } from './payments.validators';

const paymentsTotal = createCounter(
  'payment_processed_total',
  'Pagamentos processados (funil: checkout)',
  ['result'],
);

/**
 * Saga orquestrada de checkout (Payment = orquestrador):
 *  1) beginPayment (janela PENDING_PAYMENT)
 *  2) charge (mock gateway)
 *  3) outbox payment.* → Booking confirma/libera
 *
 * Compensação: se falhar após (1), RPC booking.compensate-checkout.
 */
@Injectable()
export class CheckoutSagaService {
  private readonly log = createLogger('checkout-saga');

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly booking: BookingClient,
  ) {}

  async run(input: CreatePaymentInput) {
    assertSagaInput(input);

    const reservationId = input.reservationId!.trim();
    const idempotencyKey = input.idempotencyKey!.trim();
    const amountCents = Number(input.amountCents);

    const existingPayment = await this.prisma.payment.findUnique({
      where: { idempotencyKey },
    });
    if (existingPayment) {
      paymentsTotal.inc({ result: 'idempotent' });
      return toPaymentResponse(existingPayment, true);
    }

    const activePayment = await this.prisma.payment.findFirst({
      where: {
        reservationId,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.APPROVED] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (activePayment) {
      paymentsTotal.inc({ result: 'idempotent' });
      return toPaymentResponse(activePayment, true);
    }

    const saga = await this.prisma.checkoutSaga.upsert({
      where: { idempotencyKey },
      create: {
        reservationId,
        idempotencyKey,
        status: CheckoutSagaStatus.STARTED,
      },
      update: {},
    });

    if (
      saga.status === CheckoutSagaStatus.COMPLETED ||
      saga.status === CheckoutSagaStatus.COMPENSATED
    ) {
      const pay = await this.prisma.payment.findUnique({
        where: { idempotencyKey },
      });
      if (pay) {
        paymentsTotal.inc({ result: 'idempotent' });
        return toPaymentResponse(pay, true);
      }
    }

    let reservation: Reservation;
    try {
      reservation = await this.booking.beginPayment(input, reservationId);
      await this.setSaga(saga.id, {
        status: CheckoutSagaStatus.PAYMENT_WINDOW_OPEN,
      });
    } catch (error) {
      await this.setSaga(saga.id, {
        status: CheckoutSagaStatus.FAILED,
        failureReason: errorMessage(error),
      });
      throw error;
    }

    if (reservation.status === ReservationStatus.Confirmed) {
      const approved = await this.prisma.payment.findFirst({
        where: { reservationId, status: PaymentStatus.APPROVED },
      });
      if (approved) {
        await this.setSaga(saga.id, {
          status: CheckoutSagaStatus.COMPLETED,
          paymentId: approved.id,
        });
        paymentsTotal.inc({ result: 'idempotent' });
        return toPaymentResponse(approved, true);
      }
    }

    let payment: Payment;
    try {
      payment = await this.createPaymentRow({
        reservationId,
        amountCents: reservation.amountCents || amountCents,
        idempotencyKey,
      });
    } catch (error) {
      await this.compensate(saga.id, reservationId, errorMessage(error));
      throw error;
    }

    await this.setSaga(saga.id, { paymentId: payment.id });

    if (input.asyncCharge) {
      await this.setSaga(saga.id, {
        status: CheckoutSagaStatus.WAITING_WEBHOOK,
      });
      paymentsTotal.inc({ result: 'pending_webhook' });
      this.log.info('saga_waiting_webhook', {
        sagaId: saga.id,
        reservationId,
        paymentId: payment.id,
      });
      return toPaymentResponse(payment, false);
    }

    const approved = !input.forceFail;
    await new Promise((r) => setTimeout(r, 150));

    const paymentId = payment.id;

    try {
      if (approved) {
        const transactionId = newTransactionId();
        const event = toPaymentApprovedEvent({
          paymentId,
          reservationId,
          amountCents: payment.amountCents,
          transactionId,
          orderCode: reservation.orderCode ?? undefined,
          passengerName: reservation.passenger?.name ?? undefined,
          passengerEmail: reservation.passenger?.email ?? undefined,
          seatLabel: reservation.seatLabel ?? undefined,
        });

        payment = await this.prisma.$transaction(async (tx) => {
          const updated = await tx.payment.update({
            where: { id: paymentId },
            data: {
              status: PaymentStatus.APPROVED,
              transactionId,
            },
          });
          await this.outbox.enqueue(
            tx,
            RoutingKeys.PaymentApproved,
            event,
            event.eventId,
          );
          return updated;
        });
        this.outbox.kickRelay();

        await this.setSaga(saga.id, { status: CheckoutSagaStatus.CHARGED });
        await this.setSaga(saga.id, { status: CheckoutSagaStatus.COMPLETED });
        paymentsTotal.inc({ result: 'approved' });
        this.log.info('saga_completed', {
          sagaId: saga.id,
          reservationId,
          paymentId: payment.id,
        });
      } else {
        const event = toPaymentFailedEvent({
          paymentId,
          reservationId,
          reason: 'gateway_declined',
        });

        payment = await this.prisma.$transaction(async (tx) => {
          const updated = await tx.payment.update({
            where: { id: paymentId },
            data: {
              status: PaymentStatus.FAILED,
              failureReason: 'gateway_declined',
            },
          });
          await this.outbox.enqueue(
            tx,
            RoutingKeys.PaymentFailed,
            event,
            event.eventId,
          );
          return updated;
        });
        this.outbox.kickRelay();

        await this.compensate(saga.id, reservationId, 'gateway_declined');
        paymentsTotal.inc({ result: 'failed' });
        this.log.warn('saga_compensated_gateway_declined', {
          sagaId: saga.id,
          reservationId,
          paymentId: payment.id,
        });
      }
    } catch (error) {
      const current = await this.prisma.payment.findUnique({
        where: { id: paymentId },
      });
      if (current?.status === PaymentStatus.APPROVED) {
        await this.setSaga(saga.id, {
          status: CheckoutSagaStatus.FAILED,
          failureReason: `post_charge: ${errorMessage(error)}`,
        });
        throw error;
      }
      await this.compensate(saga.id, reservationId, errorMessage(error));
      throw error;
    }

    return toPaymentResponse(payment, false);
  }

  /** Compensação disparada por webhook PSP (FAILED). */
  async compensateFromWebhook(
    sagaId: string,
    reservationId: string,
    reason: string,
  ) {
    await this.compensate(sagaId, reservationId, reason);
  }

  private async createPaymentRow(data: {
    reservationId: string;
    amountCents: number;
    idempotencyKey: string;
  }) {
    try {
      return await this.prisma.payment.create({
        data: {
          reservationId: data.reservationId,
          amountCents: data.amountCents,
          status: PaymentStatus.PENDING,
          idempotencyKey: data.idempotencyKey,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const again = await this.prisma.payment.findUnique({
          where: { idempotencyKey: data.idempotencyKey },
        });
        if (again) return again;
      }
      throw error;
    }
  }

  private async compensate(
    sagaId: string,
    reservationId: string,
    reason: string,
  ) {
    await this.setSaga(sagaId, {
      status: CheckoutSagaStatus.COMPENSATING,
      failureReason: reason,
    });

    try {
      await this.booking.compensateCheckout(reservationId, reason);
      await this.setSaga(sagaId, {
        status: CheckoutSagaStatus.COMPENSATED,
        failureReason: reason,
      });
      this.log.warn('saga_compensated', { sagaId, reservationId, reason });
    } catch (error) {
      await this.setSaga(sagaId, {
        status: CheckoutSagaStatus.FAILED,
        failureReason: `compensate_failed: ${errorMessage(error)} (${reason})`,
      });
      this.log.error('saga_compensate_failed', {
        sagaId,
        reservationId,
        reason,
        error: errorMessage(error),
      });
    }
  }

  private async setSaga(
    id: string,
    data: {
      status?: CheckoutSagaStatus;
      paymentId?: string;
      failureReason?: string;
    },
  ) {
    await this.prisma.checkoutSaga.update({
      where: { id },
      data,
    });
  }
}
