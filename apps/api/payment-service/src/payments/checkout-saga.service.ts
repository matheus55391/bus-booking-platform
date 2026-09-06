import {
  Inject,
  Injectable,
  NotFoundException,
  RequestTimeoutException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { CheckoutSagaStatus, PaymentStatus, Prisma } from '@bus/payment-prisma';
import {
  AppService,
  BookingTopics,
  type CreatePaymentInput,
  type Reservation,
} from '@repo/common';
import {
  PaymentApprovedEvent,
  PaymentFailedEvent,
  RoutingKeys,
} from '@repo/events';
import { createCounter, createLogger } from '@repo/observability';
import { randomUUID } from 'crypto';
import { firstValueFrom, TimeoutError, timeout } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMqService } from '../messaging/rabbitmq.service';

const paymentsTotal = createCounter(
  'payment_processed_total',
  'Pagamentos processados (funil: checkout)',
  ['result'],
);

/**
 * Saga orquestrada de checkout (Payment = orquestrador):
 *  1) beginPayment (janela PENDING_PAYMENT)
 *  2) charge (mock gateway)
 *  3) publish payment.* → Booking confirma/libera
 *
 * Compensação: se falhar após (1), RPC booking.compensate-checkout.
 */
@Injectable()
export class CheckoutSagaService {
  private readonly log = createLogger('checkout-saga');

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitMqService,
    @Inject(AppService.Booking) private readonly bookingClient: ClientProxy,
  ) {}

  async run(input: CreatePaymentInput) {
    const reservationId = input.reservationId?.trim();
    const idempotencyKey = input.idempotencyKey?.trim();
    const amountCents = Number(input.amountCents);

    if (!reservationId || !idempotencyKey) {
      throw new Error('reservationId and idempotencyKey required');
    }
    if (!input.passenger || !input.paymentMethod) {
      throw new Error('passenger and paymentMethod required');
    }

    const existingPayment = await this.prisma.payment.findUnique({
      where: { idempotencyKey },
    });
    if (existingPayment) {
      paymentsTotal.inc({ result: 'idempotent' });
      return this.toResponse(existingPayment, true);
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
      return this.toResponse(activePayment, true);
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
        return this.toResponse(pay, true);
      }
    }

    // --- Step 1: abrir janela de pagamento no Booking ---
    let reservation: Reservation;
    try {
      reservation = await this.beginPayment(input, reservationId);
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

    if (reservation.status === 'CONFIRMED') {
      const approved = await this.prisma.payment.findFirst({
        where: { reservationId, status: PaymentStatus.APPROVED },
      });
      if (approved) {
        await this.setSaga(saga.id, {
          status: CheckoutSagaStatus.COMPLETED,
          paymentId: approved.id,
        });
        paymentsTotal.inc({ result: 'idempotent' });
        return this.toResponse(approved, true);
      }
    }

    // --- Step 2: cobrar ---
    let payment;
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

    const approved = !input.forceFail;
    await new Promise((r) => setTimeout(r, 150));

    try {
      if (approved) {
        const transactionId = `txn_${randomUUID().slice(0, 8)}`;
        payment = await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.APPROVED,
            transactionId,
          },
        });

        await this.setSaga(saga.id, { status: CheckoutSagaStatus.CHARGED });

        const event: PaymentApprovedEvent = {
          eventId: randomUUID(),
          type: RoutingKeys.PaymentApproved,
          occurredAt: new Date().toISOString(),
          paymentId: payment.id,
          reservationId,
          amountCents: payment.amountCents,
          transactionId,
          orderCode: reservation.orderCode ?? undefined,
          passengerName: reservation.passenger?.name ?? undefined,
          passengerEmail: reservation.passenger?.email ?? undefined,
          seatLabel: reservation.seatLabel ?? undefined,
        };
        await this.publishWithRetry(RoutingKeys.PaymentApproved, event);

        await this.setSaga(saga.id, { status: CheckoutSagaStatus.COMPLETED });
        paymentsTotal.inc({ result: 'approved' });
        this.log.info('saga_completed', {
          sagaId: saga.id,
          reservationId,
          paymentId: payment.id,
        });
      } else {
        payment = await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.FAILED,
            failureReason: 'gateway_declined',
          },
        });

        const event: PaymentFailedEvent = {
          eventId: randomUUID(),
          type: RoutingKeys.PaymentFailed,
          occurredAt: new Date().toISOString(),
          paymentId: payment.id,
          reservationId,
          reason: 'gateway_declined',
        };
        await this.publishWithRetry(RoutingKeys.PaymentFailed, event);

        // Compensação explícita (RPC) + evento (coreografia) — idempotente no Booking
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
        where: { id: payment.id },
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

    return this.toResponse(payment, false);
  }

  private async beginPayment(
    input: CreatePaymentInput,
    reservationId: string,
  ): Promise<Reservation> {
    try {
      const reservation = await firstValueFrom(
        this.bookingClient
          .send<Reservation>(BookingTopics.BeginPayment, {
            reservationId,
            passenger: input.passenger,
            paymentMethod: input.paymentMethod,
          })
          .pipe(timeout(10_000)),
      );

      if (
        reservation.status !== 'PENDING_PAYMENT' &&
        reservation.status !== 'CONFIRMED'
      ) {
        throw new Error(
          `reservation is ${reservation.status}, expected PENDING_PAYMENT`,
        );
      }
      if (new Date(reservation.expiresAt).getTime() < Date.now()) {
        throw new Error('reservation already expired');
      }
      return reservation;
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw new RequestTimeoutException('booking-service timeout');
      }
      if (error instanceof RequestTimeoutException) throw error;
      throw new NotFoundException(`reservation ${reservationId} not found`);
    }
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
      await firstValueFrom(
        this.bookingClient
          .send(BookingTopics.CompensateCheckout, {
            reservationId,
            reason,
          })
          .pipe(timeout(10_000)),
      );
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

  private async publishWithRetry(routingKey: string, payload: object) {
    let lastError: unknown;
    for (let i = 0; i < 3; i++) {
      try {
        await this.rabbit.publish(routingKey, payload);
        return;
      } catch (error) {
        lastError = error;
        await new Promise((r) => setTimeout(r, 100 * (i + 1)));
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(String(lastError));
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

  private toResponse(
    payment: {
      id: string;
      reservationId: string;
      amountCents: number;
      status: PaymentStatus;
      transactionId: string | null;
      idempotencyKey: string;
      failureReason: string | null;
      createdAt: Date;
    },
    idempotentReplay: boolean,
  ) {
    return {
      id: payment.id,
      reservationId: payment.reservationId,
      amountCents: payment.amountCents,
      status: payment.status,
      transactionId: payment.transactionId,
      idempotencyKey: payment.idempotencyKey,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt.toISOString(),
      idempotentReplay,
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
