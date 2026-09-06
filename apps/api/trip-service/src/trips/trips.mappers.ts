import { SeatStatus } from '@bus/trip-prisma';
import type { HoldSeatResult, SeatLabelResult } from '@repo/common';
import type { SeatSummary, SeatView, TripSummary } from './trips.types';

type TripRow = {
  id: string;
  origin: string;
  destination: string;
  departureAt: Date;
  arrivalAt: Date;
  priceCents: number;
  companyName: string;
  availableSeats?: number;
};

type SeatRow = {
  id: string;
  label: string;
  row: number;
  column: number;
  status: SeatStatus;
};

export function toTripSummary(trip: TripRow): TripSummary {
  return {
    id: trip.id,
    origin: trip.origin,
    destination: trip.destination,
    departureAt: trip.departureAt.toISOString(),
    arrivalAt: trip.arrivalAt.toISOString(),
    priceCents: trip.priceCents,
    companyName: trip.companyName,
    availableSeats: trip.availableSeats,
  };
}

export function toSeatView(seat: SeatRow): SeatView {
  return {
    id: seat.id,
    label: seat.label,
    row: seat.row,
    column: seat.column,
    status: seat.status,
  };
}

export function toSeatSummary(seats: SeatRow[]): SeatSummary {
  return {
    available: seats.filter((s) => s.status === SeatStatus.AVAILABLE).length,
    held: seats.filter((s) => s.status === SeatStatus.HELD).length,
    sold: seats.filter((s) => s.status === SeatStatus.SOLD).length,
  };
}

export function toSeatLabelResult(input: {
  tripId: string;
  seat: SeatRow;
}): SeatLabelResult {
  return {
    tripId: input.tripId,
    seatId: input.seat.id,
    seatLabel: input.seat.label,
    status: input.seat.status,
  };
}

export function toHoldSeatResult(input: {
  tripId: string;
  seatId: string;
  seatLabel: string;
  priceCents: number;
  origin: string;
  destination: string;
}): HoldSeatResult {
  return {
    tripId: input.tripId,
    seatId: input.seatId,
    seatLabel: input.seatLabel,
    priceCents: input.priceCents,
    origin: input.origin,
    destination: input.destination,
  };
}
