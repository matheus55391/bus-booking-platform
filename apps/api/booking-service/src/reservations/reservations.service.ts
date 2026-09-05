import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, ReservationStatus } from '@bus/booking-prisma';
import type { CreateReservationInput } from '@repo/common';
import {
  PaymentApprovedEvent,
  RoutingKeys,
  SeatConfirmedEvent,
  SeatReleasedEvent,
  SeatReservedEvent,
} from '@repo/events';
import { createCounter } from '@repo/observability';
import { randomUUID } from 'crypto';
import { RabbitMqService } from '../messaging/rabbitmq.service';
import { PrismaService } from '../prisma/prisma.service';
import { HoldStoreService } from '../redis/hold-store.service';
import type { LockedSeat, SeatHold, TripPrice } from './reservations.types';

const reservationsCreated = createCounter(
  'booking_reservations_created_total',
  'Reservations created',
  ['result'],
);
const reservationsConfirmed = createCounter(
  'booking_reservations_confirmed_total',
  'Reservations confirmed after payment',
);

@Injectable()
export class ReservationsService implements OnModuleInit {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitMqService,
    private readonly holds: HoldStoreService,
  ) {}

  async onModuleInit() {
    await this.rabbit.subscribe(
      'booking.payment-approved',
      [RoutingKeys.PaymentApproved],
      async (payload) => {
        await this.onPaymentApproved(payload as PaymentApprovedEvent);
      },
    );
  }

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
      reservationsCreated.inc({ result: 'idempotent' });
      return this.toHoldResponse(existingHold, true);
    }

    const existingPaid = await this.prisma.reservation.findUnique({
      where: { idempotencyKey },
    });
    if (existingPaid) {
      reservationsCreated.inc({ result: 'idempotent' });
      return this.toDbResponse(existingPaid, null, true);
    }

    const expiresAt = new Date(Date.now() + this.holds.ttlSeconds * 1000);
    const holdId = randomUUID();

    try {
      const trip = await this.prisma.$queryRaw<TripPrice[]>`
        SELECT "priceCents" FROM "Trip" WHERE id = ${tripId} LIMIT 1
      `;
      if (trip.length === 0) {
        throw new NotFoundException(`trip ${tripId} not found`);
      }

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

      reservationsCreated.inc({ result: 'created' });
      return this.toHoldResponse(created, false);
    } catch (error) {
      reservationsCreated.inc({ result: 'error' });
      throw error;
    }
  }

  async findById(id: string) {
    const hold = await this.holds.getById(id);
    if (hold) {
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

  async onPaymentApproved(event: PaymentApprovedEvent) {
    const hold = await this.holds.getById(event.reservationId);
    if (!hold) {
      const existing = await this.prisma.reservation.findUnique({
        where: { id: event.reservationId },
      });
      if (existing?.status === ReservationStatus.CONFIRMED) {
        return;
      }
      this.logger.warn(
        `Payment for unknown/expired hold ${event.reservationId}`,
      );
      return;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
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
        await tx.$executeRaw`
          UPDATE "Seat"
          SET status = 'SOLD', "updatedAt" = NOW()
          WHERE id = ${hold.seatId}
            AND status = 'HELD'
        `;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        await this.holds.delete(hold);
        return;
      }
      throw error;
    }

    await this.holds.delete(hold);

    const confirmed: SeatConfirmedEvent = {
      eventId: randomUUID(),
      type: RoutingKeys.SeatConfirmed,
      occurredAt: new Date().toISOString(),
      reservationId: hold.id,
      tripId: hold.tripId,
      seatId: hold.seatId,
    };
    await this.rabbit.publish(RoutingKeys.SeatConfirmed, confirmed);
    reservationsConfirmed.inc();
    this.logger.log(`Reservation ${hold.id} CONFIRMED`);
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

        await this.releaseHold(hold, 'EXPIRED');
        released += 1;
      }

      if (released > 0) {
        this.logger.log(`Expired ${released} hold(s); seats released`);
      }
    } catch (error) {
      this.logger.error(
        'Failed to expire holds',
        error instanceof Error ? error : new Error(String(error)),
      );
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
