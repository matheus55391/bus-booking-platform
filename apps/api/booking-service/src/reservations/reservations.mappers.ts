import { randomUUID } from 'crypto';
import { ReservationStatus } from '@repo/common';
import {
  RoutingKeys,
  type SeatConfirmedEvent,
  type SeatReleasedEvent,
  type SeatReservedEvent,
} from '@repo/events';
import type {
  HoldResponse,
  ReservationResponse,
  ReservationWithPassenger,
  SeatHold,
} from './reservations.types';

export function toHoldResponse(
  hold: SeatHold,
  holdMinutes: number,
  idempotentReplay: boolean,
): HoldResponse {
  return {
    id: hold.id,
    tripId: hold.tripId,
    seatId: hold.seatId,
    seatLabel: hold.seatLabel,
    userId: hold.userId,
    amountCents: hold.amountCents,
    status: ReservationStatus.Reserved,
    expiresAt: hold.expiresAt,
    createdAt: hold.createdAt,
    holdMinutes,
    idempotencyKey: hold.idempotencyKey,
    idempotentReplay,
  };
}

export function toDbResponse(
  reservation: ReservationWithPassenger,
  seatLabel: string | null,
  holdMinutes: number,
  idempotentReplay: boolean,
): ReservationResponse {
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
    holdMinutes,
    idempotencyKey: reservation.idempotencyKey,
    idempotentReplay,
    orderCode: reservation.orderCode,
    paymentMethod: reservation.paymentMethod,
    passenger: {
      id: reservation.passenger.id,
      name: reservation.passenger.name,
      email: reservation.passenger.email,
      document: reservation.passenger.document,
      phone: reservation.passenger.phone,
      birthDate: reservation.passenger.birthDate,
    },
  };
}

export function toSeatReservedEvent(hold: SeatHold): SeatReservedEvent {
  return {
    eventId: randomUUID(),
    type: RoutingKeys.SeatReserved,
    occurredAt: new Date().toISOString(),
    reservationId: hold.id,
    tripId: hold.tripId,
    seatId: hold.seatId,
    seatLabel: hold.seatLabel,
    userId: hold.userId,
    expiresAt: hold.expiresAt,
    amountCents: hold.amountCents,
  };
}

export function toSeatConfirmedEvent(input: {
  reservationId: string;
  tripId: string;
  seatId: string;
  seatLabel?: string;
  reservation: ReservationWithPassenger;
}): SeatConfirmedEvent {
  return {
    eventId: randomUUID(),
    type: RoutingKeys.SeatConfirmed,
    occurredAt: new Date().toISOString(),
    reservationId: input.reservationId,
    tripId: input.tripId,
    seatId: input.seatId,
    seatLabel: input.seatLabel,
    orderCode: input.reservation.orderCode,
    passengerName: input.reservation.passenger.name,
    passengerEmail: input.reservation.passenger.email,
    amountCents: input.reservation.amountCents,
  };
}

export function toSeatReleasedEvent(
  hold: SeatHold,
  reason: 'EXPIRED' | 'CANCELLED',
): SeatReleasedEvent {
  return {
    eventId: randomUUID(),
    type: RoutingKeys.SeatReleased,
    occurredAt: new Date().toISOString(),
    reservationId: hold.id,
    tripId: hold.tripId,
    seatId: hold.seatId,
    reason,
  };
}
