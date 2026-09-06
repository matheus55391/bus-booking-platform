export interface LockedSeat {
  id: string;
  label: string;
  status: string;
}

export interface TripPrice {
  priceCents: number;
  origin: string;
  destination: string;
}

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

export function holdRoute(hold: SeatHold): {
  origin: string;
  destination: string;
} {
  return {
    origin: hold.origin ?? 'unknown',
    destination: hold.destination ?? 'unknown',
  };
}
