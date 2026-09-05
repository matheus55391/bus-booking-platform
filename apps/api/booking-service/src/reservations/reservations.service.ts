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
import {
  PaymentApprovedEvent,
  RoutingKeys,
  SeatConfirmedEvent,
  SeatReleasedEvent,
  SeatReservedEvent,
} from '@repo/events';
import { createCounter } from '@repo/observability';
import type { CreateReservationInput } from '@repo/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMqService } from '../messaging/rabbitmq.service';
import type {
  ExpiredReservationRow,
  LockedSeat,
  TripPrice,
} from './reservations.types';

const HOLD_MINUTES = 10;

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

    const existing = await this.prisma.reservation.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      reservationsCreated.inc({ result: 'idempotent' });
      const seats = await this.prisma.$queryRaw<{ label: string }[]>`
        SELECT label FROM "Seat" WHERE id = ${existing.seatId} LIMIT 1
      `;
      return this.toResponse(existing, seats[0]?.label ?? null, true);
    }

    const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);

    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const trip = await tx.$queryRaw<TripPrice[]>`
            SELECT "priceCents" FROM "Trip" WHERE id = ${tripId} LIMIT 1
          `;
          if (trip.length === 0) {
            throw new NotFoundException(`trip ${tripId} not found`);
          }

          const locked = await tx.$queryRaw<LockedSeat[]>`
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

          const created = await tx.reservation.create({
            data: {
              tripId,
              seatId,
              userId,
              amountCents: trip[0].priceCents,
              status: ReservationStatus.RESERVED,
              expiresAt,
              idempotencyKey,
            },
          });

          await tx.$executeRaw`
            UPDATE "Trip"
            SET "availableSeats" = GREATEST("availableSeats" - 1, 0),
                "updatedAt" = NOW()
            WHERE id = ${tripId}
          `;

          return { reservation: created, seatLabel: locked[0].label };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        },
      );

      const event: SeatReservedEvent = {
        eventId: randomUUID(),
        type: RoutingKeys.SeatReserved,
        occurredAt: new Date().toISOString(),
        reservationId: result.reservation.id,
        tripId: result.reservation.tripId,
        seatId: result.reservation.seatId,
        seatLabel: result.seatLabel,
        userId: result.reservation.userId,
        expiresAt: result.reservation.expiresAt.toISOString(),
        amountCents: result.reservation.amountCents,
      };
      await this.rabbit.publish(RoutingKeys.SeatReserved, event);

      reservationsCreated.inc({ result: 'created' });
      return this.toResponse(result.reservation, result.seatLabel, false);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const again = await this.prisma.reservation.findUnique({
          where: { idempotencyKey },
        });
        if (again) {
          reservationsCreated.inc({ result: 'idempotent' });
          const seats = await this.prisma.$queryRaw<{ label: string }[]>`
            SELECT label FROM "Seat" WHERE id = ${again.seatId} LIMIT 1
          `;
          return this.toResponse(again, seats[0]?.label ?? null, true);
        }
        throw new ConflictException(
          'An active reservation already exists for this seat on this trip',
        );
      }
      reservationsCreated.inc({ result: 'error' });
      throw error;
    }
  }

  async findById(id: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
    });
    if (!reservation) {
      throw new NotFoundException(`reservation ${id} not found`);
    }

    const seats = await this.prisma.$queryRaw<{ label: string }[]>`
      SELECT label FROM "Seat" WHERE id = ${reservation.seatId} LIMIT 1
    `;

    return this.toResponse(reservation, seats[0]?.label ?? null, false);
  }

  async onPaymentApproved(event: PaymentApprovedEvent) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: event.reservationId },
    });
    if (!reservation) {
      this.logger.warn(`Payment for unknown reservation ${event.reservationId}`);
      return;
    }
    if (reservation.status === ReservationStatus.CONFIRMED) {
      return;
    }
    if (reservation.status !== ReservationStatus.RESERVED) {
      this.logger.warn(
        `Cannot confirm reservation ${reservation.id} in status ${reservation.status}`,
      );
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: ReservationStatus.CONFIRMED },
      });
      await tx.$executeRaw`
        UPDATE "Seat"
        SET status = 'SOLD', "updatedAt" = NOW()
        WHERE id = ${reservation.seatId}
          AND status = 'HELD'
      `;
    });

    const confirmed: SeatConfirmedEvent = {
      eventId: randomUUID(),
      type: RoutingKeys.SeatConfirmed,
      occurredAt: new Date().toISOString(),
      reservationId: reservation.id,
      tripId: reservation.tripId,
      seatId: reservation.seatId,
    };
    await this.rabbit.publish(RoutingKeys.SeatConfirmed, confirmed);
    reservationsConfirmed.inc();
    this.logger.log(`Reservation ${reservation.id} CONFIRMED`);
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async expireReservations() {
    try {
      const expired = await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<ExpiredReservationRow[]>`
          UPDATE "Reservation"
          SET status = 'EXPIRED', "updatedAt" = NOW()
          WHERE status = 'RESERVED'
            AND "expiresAt" < NOW()
          RETURNING id, "seatId", "tripId"
        `;

        for (const row of rows) {
          await tx.$executeRaw`
            UPDATE "Seat"
            SET status = 'AVAILABLE', "updatedAt" = NOW()
            WHERE id = ${row.seatId}
              AND status = 'HELD'
          `;
          await tx.$executeRaw`
            UPDATE "Trip"
            SET "availableSeats" = "availableSeats" + 1,
                "updatedAt" = NOW()
            WHERE id = ${row.tripId}
          `;
        }

        return rows;
      });

      for (const row of expired) {
        const released: SeatReleasedEvent = {
          eventId: randomUUID(),
          type: RoutingKeys.SeatReleased,
          occurredAt: new Date().toISOString(),
          reservationId: row.id,
          tripId: row.tripId,
          seatId: row.seatId,
          reason: 'EXPIRED',
        };
        await this.rabbit.publish(RoutingKeys.SeatReleased, released);
      }

      if (expired.length > 0) {
        this.logger.log(`Expired ${expired.length} reservation(s); seats released`);
      }
    } catch (error) {
      this.logger.error('Failed to expire reservations', error as Error);
    }
  }

  private toResponse(
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
      holdMinutes: HOLD_MINUTES,
      idempotencyKey: reservation.idempotencyKey,
      idempotentReplay,
    };
  }
}
