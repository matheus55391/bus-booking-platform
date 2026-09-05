import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SeatStatus } from '@bus/trip-prisma';
import { PrismaService } from '../prisma/prisma.service';

export type SearchTripsQuery = {
  origin?: string;
  destination?: string;
  date?: string;
};

@Injectable()
export class TripsService {
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
      trips: trips.map((trip) => ({
        id: trip.id,
        origin: trip.origin,
        destination: trip.destination,
        departureAt: trip.departureAt.toISOString(),
        arrivalAt: trip.arrivalAt.toISOString(),
        priceCents: trip.priceCents,
        companyName: trip.companyName,
        availableSeats: trip.availableSeats,
      })),
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

    const summary = {
      available: trip.seats.filter((s) => s.status === SeatStatus.AVAILABLE)
        .length,
      held: trip.seats.filter((s) => s.status === SeatStatus.HELD).length,
      sold: trip.seats.filter((s) => s.status === SeatStatus.SOLD).length,
    };

    return {
      trip: {
        id: trip.id,
        origin: trip.origin,
        destination: trip.destination,
        departureAt: trip.departureAt.toISOString(),
        arrivalAt: trip.arrivalAt.toISOString(),
        priceCents: trip.priceCents,
        companyName: trip.companyName,
      },
      summary,
      seats: trip.seats.map((seat) => ({
        id: seat.id,
        label: seat.label,
        row: seat.row,
        column: seat.column,
        status: seat.status,
      })),
    };
  }
}
