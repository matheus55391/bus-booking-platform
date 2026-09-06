import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SeatStatus } from '@bus/trip-prisma';
import type {
  HoldSeatInput,
  HoldSeatResult,
  SearchTripsQuery,
  SeatLabelResult,
  SeatMutationInput,
} from '@repo/common';
import { createLogger } from '@repo/observability';
import { PrismaService } from '../prisma/prisma.service';
import {
  toHoldSeatResult,
  toSeatLabelResult,
  toSeatSummary,
  toSeatView,
  toTripSummary,
} from './trips.mappers';
import { STALE_HELD_MS } from './trips.types';

@Injectable()
export class TripsService {
  private readonly log = createLogger('trips');

  constructor(private readonly prisma: PrismaService) {}

  async search(query: SearchTripsQuery) {
    const origin = query.origin?.trim();
    const destination = query.destination?.trim();
    const date = query.date?.trim();

    if (!origin || !destination || !date) {
      throw new BadRequestException(
        'origin, destination and date (YYYY-MM-DD) are required',
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }

    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${date}T23:59:59.999Z`);

    const trips = await this.prisma.trip.findMany({
      where: {
        origin: { equals: origin, mode: 'insensitive' },
        destination: { equals: destination, mode: 'insensitive' },
        departureAt: { gte: start, lte: end },
      },
      orderBy: { departureAt: 'asc' },
    });

    return {
      query: { origin, destination, date },
      count: trips.length,
      trips: trips.map(toTripSummary),
    };
  }

  async getSeats(tripId: string) {
    const id = tripId?.trim();
    if (!id) {
      throw new BadRequestException('tripId is required');
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        seats: { orderBy: [{ row: 'asc' }, { column: 'asc' }] },
      },
    });

    if (!trip) {
      throw new NotFoundException(`trip ${id} not found`);
    }

    return {
      trip: toTripSummary(trip),
      summary: toSeatSummary(trip.seats),
      seats: trip.seats.map(toSeatView),
    };
  }

  async getSeat(input: SeatMutationInput): Promise<SeatLabelResult> {
    const tripId = input.tripId?.trim();
    const seatId = input.seatId?.trim();
    if (!tripId || !seatId) {
      throw new BadRequestException('tripId and seatId are required');
    }

    const seat = await this.prisma.seat.findFirst({
      where: { id: seatId, tripId },
    });
    if (!seat) {
      throw new NotFoundException(`seat ${seatId} not found on trip ${tripId}`);
    }

    return toSeatLabelResult({ tripId, seat });
  }

  /** Único writer síncrono do hold: AVAILABLE → HELD + decrementa availableSeats. */
  async holdSeat(input: HoldSeatInput): Promise<HoldSeatResult> {
    const tripId = input.tripId?.trim();
    const seatId = input.seatId?.trim();
    if (!tripId || !seatId) {
      throw new BadRequestException('tripId and seatId are required');
    }

    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`trip ${tripId} not found`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string; label: string }[]>`
        UPDATE "Seat"
        SET status = 'HELD', "updatedAt" = NOW()
        WHERE id = ${seatId}
          AND "tripId" = ${tripId}
          AND status = 'AVAILABLE'
        RETURNING id, label
      `;
      if (locked.length === 0) {
        return null;
      }
      await tx.$executeRaw`
        UPDATE "Trip"
        SET "availableSeats" = GREATEST("availableSeats" - 1, 0),
            "updatedAt" = NOW()
        WHERE id = ${tripId}
      `;
      return locked[0];
    });

    if (!result) {
      throw new ConflictException(
        'Seat is not available for this trip (already held or sold)',
      );
    }

    this.log.info('seat_held', { tripId, seatId, seatLabel: result.label });
    return toHoldSeatResult({
      tripId,
      seatId: result.id,
      seatLabel: result.label,
      priceCents: trip.priceCents,
      origin: trip.origin,
      destination: trip.destination,
    });
  }

  async confirmSeat(input: SeatMutationInput) {
    const tripId = input.tripId?.trim();
    const seatId = input.seatId?.trim();
    if (!tripId || !seatId) {
      throw new BadRequestException('tripId and seatId are required');
    }

    await this.prisma.$executeRaw`
      UPDATE "Seat"
      SET status = 'SOLD', "updatedAt" = NOW()
      WHERE id = ${seatId}
        AND "tripId" = ${tripId}
        AND status IN ('HELD', 'SOLD')
    `;
    this.log.info('seat_sold', { tripId, seatId });
    return { ok: true };
  }

  async releaseSeat(input: SeatMutationInput) {
    const tripId = input.tripId?.trim();
    const seatId = input.seatId?.trim();
    if (!tripId || !seatId) {
      throw new BadRequestException('tripId and seatId are required');
    }

    await this.prisma.$transaction(async (tx) => {
      const released = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "Seat"
        SET status = 'AVAILABLE', "updatedAt" = NOW()
        WHERE id = ${seatId}
          AND "tripId" = ${tripId}
          AND status = 'HELD'
        RETURNING id
      `;
      if (released.length > 0) {
        await tx.$executeRaw`
          UPDATE "Trip"
          SET "availableSeats" = "availableSeats" + 1,
              "updatedAt" = NOW()
          WHERE id = ${tripId}
        `;
      }
    });
    this.log.info('seat_released', { tripId, seatId });
    return { ok: true };
  }

  /** Healing: HELD antigo sem renovação (Booking não escreve Seat). */
  @Cron(CronExpression.EVERY_MINUTE)
  async healStaleHeld() {
    try {
      const cutoff = new Date(Date.now() - STALE_HELD_MS);
      const stale = await this.prisma.seat.findMany({
        where: { status: SeatStatus.HELD, updatedAt: { lt: cutoff } },
        take: 50,
      });
      for (const seat of stale) {
        await this.releaseSeat({ tripId: seat.tripId, seatId: seat.id });
        this.log.warn('healed_stale_held_seat', {
          seatId: seat.id,
          tripId: seat.tripId,
        });
      }
    } catch (error) {
      this.log.error('heal_stale_held_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
