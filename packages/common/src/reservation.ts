export type ReservationStatus =
  "RESERVED" | "CONFIRMED" | "EXPIRED" | "CANCELLED";

export type CreateReservationInput = {
  tripId: string;
  seatId: string;
  userId?: string;
  idempotencyKey: string;
};

/** Resposta HTTP de reserva (Booking → Gateway → Web). */
export type Reservation = {
  id: string;
  tripId: string;
  seatId: string;
  seatLabel: string | null;
  userId?: string;
  amountCents: number;
  status: ReservationStatus | string;
  expiresAt: string;
  createdAt?: string;
  holdMinutes: number;
  idempotencyKey?: string;
  idempotentReplay?: boolean;
};
