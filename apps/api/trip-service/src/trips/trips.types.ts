/** HELD sem renovação (hold Redis ~1–2 min + folga). */
export const STALE_HELD_MS = 15 * 60 * 1000;

export interface TripSummary {
  id: string;
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  priceCents: number;
  companyName: string;
  availableSeats?: number;
}

export interface SeatSummary {
  available: number;
  held: number;
  sold: number;
}

export interface SeatView {
  id: string;
  label: string;
  row: number;
  column: number;
  status: string;
}
