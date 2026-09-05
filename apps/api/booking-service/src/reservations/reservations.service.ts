import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, ReservationStatus } from '@bus/booking-prisma';
import type { CreateReservationInput } from '@repo/common';
import {
  PaymentApprovedEvent,
  PaymentFailedEvent,
  RoutingKeys,
  SeatConfirmedEvent,
  SeatReleasedEvent,
  SeatReservedEvent,
} from '@repo/events';
import { createLogger } from '@repo/observability';
import { randomUUID } from 'crypto';
import { RabbitMqService } from '../messaging/rabbitmq.service';
import { PrismaService } from '../prisma/prisma.service';
import { HoldStoreService } from '../redis/hold-store.service';
import {
  holdsConfirmed,
  holdsCreated,
  holdsExpired,
} from './reservations.metrics';
import {
  holdRoute,
  LockedSeat,
  SeatHold,
  TripPrice,
} from './reservations.types';

/** Janela extra no Redis enquanto o pagamento roda. */
const PAYMENT_HOLD_TTL_SECONDS = 120;

@Injectable()
export class ReservationsService implements OnModuleInit {
  private readonly log = createLogger('reservations');

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitMqService,
    private readonly holds: HoldStoreService,
  ) {}

  async onModuleInit() {
    await this.rabbit.subscribe(
      'booking_domain',
      [RoutingKeys.PaymentApproved, RoutingKeys.PaymentFailed],
      async (payload, routingKey) => {
        if (routingKey === RoutingKeys.PaymentApproved) {
          await this.onPaymentApproved(payload as PaymentApprovedEvent);
          return;
        }
        if (routingKey === RoutingKeys.PaymentFailed) {
          await this.onPaymentFailed(payload as PaymentFailedEvent);
        }
      },
    );
  }

  /**
   * Cria hold no Redis + marca assento HELD + publica seat.reserved.
   * Não grava Reservation no Postgres.
   */
  async create(input: CreateReservationInput) {
    const tripId = input.tripId?.trim();
    const seatId = input.seatId?.trim();
    const userId = (input.userId?.trim() || 'demo-passenger').slice(0, 120);
    const idempotencyKey = input.idempotencyKey?.trim();

    if (!tripId || !seatId) {
      throw new BadRequestException('tripId and seatId are required');
    }
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key is required');
    }

    const existingHold = await this.holds.getByIdempotencyKey(idempotencyKey);
    if (existingHold) {
      holdsCreated.inc({
        result: 'idempotent',
        ...holdRoute(existingHold),
      });
      return this.toHoldResponse(existingHold, true);
    }

    const existingPaid = await this.prisma.reservation.findUnique({
      where: { idempotencyKey },
    });
    if (existingPaid) {
      holdsCreated.inc({
        result: 'idempotent',
        origin: 'unknown',
        destination: 'unknown',
      });
      return this.toDbResponse(existingPaid, null, true);
    }

    const expiresAt = new Date(Date.now() + this.holds.ttlSeconds * 1000);
    const holdId = randomUUID();

    try {
      const trip = await this.prisma.$queryRaw<TripPrice[]>`
        SELECT "priceCents", origin, destination
        FROM "Trip"
        WHERE id = ${tripId}
        LIMIT 1
      `;
      if (trip.length === 0) {
        throw new NotFoundException(`trip ${tripId} not found`);
      }

      const origin = trip[0].origin;
      const destination = trip[0].destination;

      const locked = await this.prisma.$queryRaw<LockedSeat[]>`
        UPDATE "Seat"
        SET status = 'HELD', "updatedAt" = NOW()
        WHERE id = ${seatId}
          AND "tripId" = ${tripId}
          AND status = 'AVAILABLE'
        RETURNING id, label, status::text AS status
      `;

      if (locked.length === 0) {
        throw new ConflictException(
          'Seat is not available for this trip (already held or sold)',
        );
      }

      const seatLabel = locked[0].label;
      const hold: SeatHold = {
        id: holdId,
        tripId,
        seatId,
        seatLabel,
        userId,
        amountCents: trip[0].priceCents,
        idempotencyKey,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        origin,
        destination,
      };

      const created = await this.holds.tryCreate(hold);
      if (!created) {
        await this.prisma.$executeRaw`
          UPDATE "Seat"
          SET status = 'AVAILABLE', "updatedAt" = NOW()
          WHERE id = ${seatId}
            AND status = 'HELD'
        `;
        throw new ConflictException(
          'Seat is not available for this trip (already held or sold)',
        );
      }

      await this.prisma.$executeRaw`
        UPDATE "Trip"
        SET "availableSeats" = GREATEST("availableSeats" - 1, 0),
            "updatedAt" = NOW()
        WHERE id = ${tripId}
      `;

      const event: SeatReservedEvent = {
        eventId: randomUUID(),
        type: RoutingKeys.SeatReserved,
        occurredAt: new Date().toISOString(),
        reservationId: created.id,
        tripId: created.tripId,
        seatId: created.seatId,
        seatLabel: created.seatLabel,
        userId: created.userId,
        expiresAt: created.expiresAt,
        amountCents: created.amountCents,
      };
      await this.rabbit.publish(RoutingKeys.SeatReserved, event);

      holdsCreated.inc({ result: 'created', origin, destination });
      this.log.info('hold_created', {
        holdId: created.id,
        tripId,
        seatId,
        seatLabel,
        userId,
        origin,
        destination,
        amountCents: created.amountCents,
        expiresAt: created.expiresAt,
      });

      return this.toHoldResponse(created, false);
    } catch (error) {
      holdsCreated.inc({
        result: 'error',
        origin: 'unknown',
        destination: 'unknown',
      });
      throw error;
    }
  }

  async findById(id: string) {
    const hold = await this.holds.getById(id);
    if (hold) {
      const pending = await this.prisma.reservation.findUnique({
        where: { id },
      });
      if (pending?.status === ReservationStatus.PENDING_PAYMENT) {
        return this.toDbResponse(pending, hold.seatLabel, false);
      }
      return this.toHoldResponse(hold, false);
    }

    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
    });
    if (!reservation) {
      throw new NotFoundException(`reservation ${id} not found`);
    }

    const seats = await this.prisma.$queryRaw<{ label: string }[]>`
      SELECT label FROM "Seat" WHERE id = ${reservation.seatId} LIMIT 1
    `;

    return this.toDbResponse(reservation, seats[0]?.label ?? null, false);
  }

  /**
   * Primeira gravação no Postgres: pagamento foi iniciado.
   * Hold continua no Redis até CONFIRMED ou FAILED.
   */
  async beginPayment(reservationId: string) {
    const id = reservationId?.trim();
    if (!id) {
      throw new BadRequestException('reservationId is required');
    }

    const existing = await this.prisma.reservation.findUnique({ where: { id } });
    if (existing?.status === ReservationStatus.CONFIRMED) {
      return this.toDbResponse(existing, null, true);
    }
    if (existing?.status === ReservationStatus.PENDING_PAYMENT) {
      const hold = await this.holds.getById(id);
      if (hold) {
        await this.holds.refresh(hold, PAYMENT_HOLD_TTL_SECONDS);
      }
      return this.toDbResponse(existing, hold?.seatLabel ?? null, true);
    }

    const hold = await this.holds.getById(id);
    if (!hold) {
      throw new NotFoundException(`hold ${id} not found or expired`);
    }
    if (new Date(hold.expiresAt).getTime() < Date.now()) {
      throw new BadRequestException('reservation already expired');
    }

    const refreshed = await this.holds.refresh(hold, PAYMENT_HOLD_TTL_SECONDS);

    try {
      const created = await this.prisma.reservation.create({
        data: {
          id: refreshed.id,
          tripId: refreshed.tripId,
          seatId: refreshed.seatId,
          userId: refreshed.userId,
          amountCents: refreshed.amountCents,
          status: ReservationStatus.PENDING_PAYMENT,
          expiresAt: new Date(refreshed.expiresAt),
          idempotencyKey: refreshed.idempotencyKey,
        },
      });

      this.log.info('payment_started', {
        holdId: created.id,
        tripId: created.tripId,
        seatId: created.seatId,
        ...holdRoute(refreshed),
        amountCents: created.amountCents,
      });

      return this.toDbResponse(created, refreshed.seatLabel, false);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const again = await this.prisma.reservation.findUnique({
          where: { id },
        });
        if (again) {
          return this.toDbResponse(again, refreshed.seatLabel, true);
        }
      }
      throw error;
    }
  }

  async onPaymentApproved(event: PaymentApprovedEvent) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: event.reservationId },
    });

    if (reservation?.status === ReservationStatus.CONFIRMED) {
      return;
    }

    const hold = await this.holds.getById(event.reservationId);

    if (!reservation && !hold) {
      this.log.warn('payment_for_unknown_hold', {
        reservationId: event.reservationId,
        paymentId: event.paymentId,
      });
      return;
    }

    const seatId = reservation?.seatId ?? hold!.seatId;
    const tripId = reservation?.tripId ?? hold!.tripId;

    try {
      await this.prisma.$transaction(async (tx) => {
        if (reservation) {
          await tx.reservation.update({
            where: { id: event.reservationId },
            data: { status: ReservationStatus.CONFIRMED },
          });
        } else if (hold) {
          await tx.reservation.create({
            data: {
              id: hold.id,
              tripId: hold.tripId,
              seatId: hold.seatId,
              userId: hold.userId,
              amountCents: hold.amountCents,
              status: ReservationStatus.CONFIRMED,
              expiresAt: new Date(hold.expiresAt),
              idempotencyKey: hold.idempotencyKey,
            },
          });
        }

        await tx.$executeRaw`
          UPDATE "Seat"
          SET status = 'SOLD', "updatedAt" = NOW()
          WHERE id = ${seatId}
            AND status IN ('HELD', 'SOLD')
        `;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        if (hold) await this.holds.delete(hold);
        return;
      }
      throw error;
    }

    if (hold) {
      await this.holds.delete(hold);
    }

    const confirmed: SeatConfirmedEvent = {
      eventId: randomUUID(),
      type: RoutingKeys.SeatConfirmed,
      occurredAt: new Date().toISOString(),
      reservationId: event.reservationId,
      tripId,
      seatId,
    };
    await this.rabbit.publish(RoutingKeys.SeatConfirmed, confirmed);

    const route = hold ? holdRoute(hold) : { origin: 'unknown', destination: 'unknown' };
    holdsConfirmed.inc(route);
    this.log.info('hold_confirmed', {
      holdId: event.reservationId,
      tripId,
      seatId,
      seatLabel: hold?.seatLabel,
      userId: hold?.userId ?? reservation?.userId,
      ...route,
      amountCents: hold?.amountCents ?? reservation?.amountCents,
      paymentId: event.paymentId,
    });
  }

  async onPaymentFailed(event: PaymentFailedEvent) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: event.reservationId },
    });

    if (reservation?.status === ReservationStatus.PENDING_PAYMENT) {
      await this.prisma.reservation.update({
        where: { id: event.reservationId },
        data: { status: ReservationStatus.CANCELLED },
      });
    }

    const hold = await this.holds.getById(event.reservationId);
    if (hold) {
      await this.releaseHold(hold, 'CANCELLED');
    }

    this.log.warn('payment_failed_released', {
      reservationId: event.reservationId,
      paymentId: event.paymentId,
      reason: event.reason,
    });
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async expireHolds() {
    try {
      const dueIds = await this.holds.listDueIds();
      if (dueIds.length === 0) return;

      let released = 0;
      for (const id of dueIds) {
        const hold = await this.holds.getById(id);
        if (!hold) {
          await this.holds.removeDueId(id);
          continue;
        }

        // Checkout em andamento: não libera pelo TTL do hold inicial
        const pending = await this.prisma.reservation.findUnique({
          where: { id },
        });
        if (pending?.status === ReservationStatus.PENDING_PAYMENT) {
          if (new Date(hold.expiresAt).getTime() > Date.now()) {
            continue;
          }
          // Janela de pagamento também expirou
          await this.prisma.reservation.update({
            where: { id },
            data: { status: ReservationStatus.EXPIRED },
          });
        }

        await this.releaseHold(hold, 'EXPIRED');
        released += 1;
      }

      if (released > 0) {
        this.log.info('holds_expired_batch', { released });
      }
    } catch (error) {
      this.log.error('Failed to expire holds', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async releaseHold(hold: SeatHold, reason: 'EXPIRED' | 'CANCELLED') {
    await this.holds.delete(hold);

    await this.prisma.$executeRaw`
      UPDATE "Seat"
      SET status = 'AVAILABLE', "updatedAt" = NOW()
      WHERE id = ${hold.seatId}
        AND status = 'HELD'
    `;
    await this.prisma.$executeRaw`
      UPDATE "Trip"
      SET "availableSeats" = "availableSeats" + 1,
          "updatedAt" = NOW()
      WHERE id = ${hold.tripId}
    `;

    const released: SeatReleasedEvent = {
      eventId: randomUUID(),
      type: RoutingKeys.SeatReleased,
      occurredAt: new Date().toISOString(),
      reservationId: hold.id,
      tripId: hold.tripId,
      seatId: hold.seatId,
      reason,
    };
    await this.rabbit.publish(RoutingKeys.SeatReleased, released);

    const route = holdRoute(hold);
    holdsExpired.inc({ ...route, reason });
    this.log.info('hold_released', {
      holdId: hold.id,
      tripId: hold.tripId,
      seatId: hold.seatId,
      seatLabel: hold.seatLabel,
      userId: hold.userId,
      ...route,
      reason,
    });
  }

  private toHoldResponse(hold: SeatHold, idempotentReplay: boolean) {
    return {
      id: hold.id,
      tripId: hold.tripId,
      seatId: hold.seatId,
      seatLabel: hold.seatLabel,
      userId: hold.userId,
      amountCents: hold.amountCents,
      status: 'RESERVED' as const,
      expiresAt: hold.expiresAt,
      createdAt: hold.createdAt,
      holdMinutes: this.holds.holdMinutes,
      idempotencyKey: hold.idempotencyKey,
      idempotentReplay,
    };
  }

  private toDbResponse(
    reservation: {
      id: string;
      tripId: string;
      seatId: string;
      userId: string;
      amountCents: number;
      status: ReservationStatus;
      expiresAt: Date;
      createdAt?: Date;
      idempotencyKey: string;
    },
    seatLabel: string | null,
    idempotentReplay: boolean,
  ) {
    return {
      id: reservation.id,
      tripId: reservation.tripId,
      seatId: reservation.seatId,
      seatLabel,
      userId: reservation.userId,
      amountCents: reservation.amountCents,
      status: reservation.status,
      expiresAt: reservation.expiresAt.toISOString(),
      createdAt: reservation.createdAt?.toISOString(),
      holdMinutes: this.holds.holdMinutes,
      idempotencyKey: reservation.idempotencyKey,
      idempotentReplay,
    };
  }
}
