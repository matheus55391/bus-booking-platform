/** Shapes internas do SQL / lock — não fazem parte do contrato HTTP. */

export type LockedSeat = {
  id: string;
  label: string;
  status: string;
};

export type TripPrice = {
  priceCents: number;
};

export type ExpiredReservationRow = {
  id: string;
  seatId: string;
  tripId: string;
};
