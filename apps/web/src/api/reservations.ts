import type { Reservation } from "@/types";
import { apiUrl, parseApiError } from "./client";

export async function createReservation(input: {
  tripId: string;
  seatId: string;
  userId?: string;
  idempotencyKey: string;
}): Promise<Reservation> {
  const response = await fetch(apiUrl("/reservations"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      tripId: input.tripId,
      seatId: input.seatId,
      userId: input.userId ?? "demo-passenger",
    }),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  return response.json() as Promise<Reservation>;
}

export async function getReservation(id: string): Promise<Reservation> {
  const response = await fetch(apiUrl(`/reservations/${id}`), {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  return response.json() as Promise<Reservation>;
}
