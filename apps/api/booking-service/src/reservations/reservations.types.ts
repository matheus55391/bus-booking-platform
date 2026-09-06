import type {
  PaymentMethod as PrismaPaymentMethod,
  ReservationStatus as PrismaReservationStatus,
} from '@bus/booking-prisma';
import { ReservationStatus, type HoldSeatResult } from '@repo/common';

/** Hold temporário (não pago) — fonte de verdade no Redis. */
export interface SeatHold {
  id: string;
  tripId: string;
  seatId: string;
  seatLabel: string;
  userId: string;
  amountCents: number;
  idempotencyKey: string;
  createdAt: string;
  expiresAt: string;
  origin?: string;
  destination?: string;
}

export interface PassengerRecord {
  id: string;
  name: string;
  email: string;
  document: string;
  phone: string;
  birthDate: string;
}

/** Reservation com passenger (queries Prisma include). */
export interface ReservationWithPassenger {
  id: string;
  tripId: string;
  seatId: string;
  userId: string;
  amountCents: number;
  status: PrismaReservationStatus;
  expiresAt: Date;
  createdAt?: Date;
  idempotencyKey: string;
  orderCode: string;
  paymentMethod: PrismaPaymentMethod;
  passengerId?: string;
  passenger: PassengerRecord;
}

export interface HoldResponse {
  id: string;
  tripId: string;
  seatId: string;
  seatLabel: string;
  userId: string;
  amountCents: number;
  status: ReservationStatus;
  expiresAt: string;
  createdAt: string;
  holdMinutes: number;
  idempotencyKey: string;
  idempotentReplay: boolean;
}

export interface ReservationResponse {
  id: string;
  tripId: string;
  seatId: string;
  seatLabel: string | null;
  userId: string;
  amountCents: number;
  status: PrismaReservationStatus;
  expiresAt: string;
  createdAt?: string;
  holdMinutes: number;
  idempotencyKey: string;
  idempotentReplay: boolean;
  orderCode: string;
  paymentMethod: PrismaPaymentMethod;
  passenger: PassengerRecord;
}

export type RouteLabels = { origin: string; destination: string };

/** Janela extra no Redis enquanto o pagamento roda. */
export const PAYMENT_HOLD_TTL_SECONDS = 120;

export function holdRoute(hold: SeatHold): RouteLabels {
  return {
    origin: hold.origin ?? 'unknown',
    destination: hold.destination ?? 'unknown',
  };
}

export function buildSeatHold(input: {
  holdId: string;
  userId: string;
  idempotencyKey: string;
  expiresAt: Date;
  inventory: HoldSeatResult;
}): SeatHold {
  return {
    id: input.holdId,
    tripId: input.inventory.tripId,
    seatId: input.inventory.seatId,
    seatLabel: input.inventory.seatLabel,
    userId: input.userId,
    amountCents: input.inventory.priceCents,
    idempotencyKey: input.idempotencyKey,
    createdAt: new Date().toISOString(),
    expiresAt: input.expiresAt.toISOString(),
    origin: input.inventory.origin,
    destination: input.inventory.destination,
  };
}
