export type SeatStatus = "AVAILABLE" | "HELD" | "SOLD";

export type Seat = {
  id: string;
  label: string;
  row: number;
  column: number;
  status: SeatStatus;
};

export type Trip = {
  id: string;
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  priceCents: number;
  companyName: string;
  availableSeats: number;
};

export type SearchTripsQuery = {
  origin?: string;
  destination?: string;
  date?: string;
};

export type SearchResponse = {
  query: { origin: string; destination: string; date: string };
  count: number;
  trips: Trip[];
};

export type SeatsResponse = {
  trip: Omit<Trip, "availableSeats">;
  summary: { available: number; held: number; sold: number };
  seats: Seat[];
};
