import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  RequestTimeoutException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PaymentStatus, Prisma } from '@bus/payment-prisma';
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

@Injectable()
export class PaymentsService {
  private readonly log = createLogger('payments');

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitMqService,
    @Inject(AppService.Booking) private readonly bookingClient: ClientProxy,
  ) {}

  async create(input: CreatePaymentInput) {
    const reservationId = input.reservationId?.trim();
    const idempotencyKey = input.idempotencyKey?.trim();
    const amountCents = Number(input.amountCents);

    if (!reservationId) {
      throw new BadRequestException('reservationId is required');
    }
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key is required');
    }
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new BadRequestException('amountCents must be > 0');
    }

    const existing = await this.prisma.payment.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      paymentsTotal.inc({ result: 'idempotent' });
      return this.toResponse(existing, true);
    }

    // 1) Promoove hold Redis → Reservation PENDING_PAYMENT no Postgres
    let reservation: Reservation;
    try {
      reservation = await firstValueFrom(
        this.bookingClient
          .send<Reservation>(BookingTopics.BeginPayment, {
            reservationId,
          })
          .pipe(timeout(10_000)),
      );
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw new RequestTimeoutException('booking-service timeout');
      }
      throw new NotFoundException(`reservation ${reservationId} not found`);
    }

    if (
      reservation.status !== 'PENDING_PAYMENT' &&
      reservation.status !== 'CONFIRMED'
    ) {
      throw new BadRequestException(
        `reservation is ${reservation.status}, expected PENDING_PAYMENT`,
      );
    }
    if (new Date(reservation.expiresAt).getTime() < Date.now()) {
      throw new BadRequestException('reservation already expired');
    }

    if (reservation.status === 'CONFIRMED') {
      const existingForReservation = await this.prisma.payment.findFirst({
        where: { reservationId, status: PaymentStatus.APPROVED },
      });
      if (existingForReservation) {
        paymentsTotal.inc({ result: 'idempotent' });
        return this.toResponse(existingForReservation, true);
      }
    }

    let payment;
    try {
      payment = await this.prisma.payment.create({
        data: {
          reservationId,
          amountCents: reservation.amountCents || amountCents,
          status: PaymentStatus.PENDING,
          idempotencyKey,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const again = await this.prisma.payment.findUnique({
          where: { idempotencyKey },
        });
        if (again) {
          paymentsTotal.inc({ result: 'idempotent' });
          return this.toResponse(again, true);
        }
      }
      throw error;
    }

    // Mock Payment Gateway
    const approved = !input.forceFail;
    await new Promise((r) => setTimeout(r, 150));

    if (approved) {
      const transactionId = `txn_${randomUUID().slice(0, 8)}`;
      payment = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.APPROVED,
          transactionId,
        },
      });

      const event: PaymentApprovedEvent = {
        eventId: randomUUID(),
        type: RoutingKeys.PaymentApproved,
        occurredAt: new Date().toISOString(),
        paymentId: payment.id,
        reservationId,
        amountCents: payment.amountCents,
        transactionId,
      };
      await this.rabbit.publish(RoutingKeys.PaymentApproved, event);
      paymentsTotal.inc({ result: 'approved' });
      this.log.info('payment_approved', {
        paymentId: payment.id,
        reservationId,
        amountCents: payment.amountCents,
        transactionId,
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
      await this.rabbit.publish(RoutingKeys.PaymentFailed, event);
      paymentsTotal.inc({ result: 'failed' });
      this.log.warn('payment_failed', {
        paymentId: payment.id,
        reservationId,
        reason: 'gateway_declined',
      });
    }

    return this.toResponse(payment, false);
  }

  async findById(id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException(`payment ${id} not found`);
    return this.toResponse(payment, false);
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
