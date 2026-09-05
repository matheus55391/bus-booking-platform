export type LockedSeat = {
  id: string;
  label: string;
  status: string;
};

export type TripPrice = {
  priceCents: number;
};

/** Hold temporário (não pago) — fonte de verdade no Redis. */
export type SeatHold = {
  id: string;
  tripId: string;
  seatId: string;
  seatLabel: string;
  userId: string;
  amountCents: number;
  idempotencyKey: string;
  createdAt: string;
  expiresAt: string;
};
