import type { SearchResponse, SeatsResponse } from "@/types";
import { apiUrl, parseApiError } from "./client";

export async function searchTrips(input: {
  origin: string;
  destination: string;
  date: string;
}): Promise<SearchResponse> {
  const params = new URLSearchParams(input);
  const response = await fetch(apiUrl(`/trips/search?${params}`), {
    next: { revalidate: 0 },
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  return response.json() as Promise<SearchResponse>;
}

export async function getTripSeats(tripId: string): Promise<SeatsResponse> {
  const response = await fetch(apiUrl(`/trips/${tripId}/seats`), {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  return response.json() as Promise<SeatsResponse>;
}
