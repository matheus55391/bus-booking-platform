import type {
  Payment,
  Reservation,
  SearchResponse,
  SeatsResponse,
} from './types';

function gatewayBase() {
  return (
    process.env.GATEWAY_URL ??
    process.env.NEXT_PUBLIC_GATEWAY_URL ??
    'http://localhost:3001'
  );
}

async function parseError(response: Response) {
  const body = await response.json().catch(() => null);
  const message =
    body?.message ||
    (typeof body === 'string' ? body : null) ||
    `Erro ${response.status}`;
  return Array.isArray(message) ? message.join(', ') : String(message);
}

export async function searchTrips(input: {
  origin: string;
  destination: string;
  date: string;
}): Promise<SearchResponse> {
  const params = new URLSearchParams(input);
  const response = await fetch(`${gatewayBase()}/trips/search?${params}`, {
    next: { revalidate: 0 },
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return response.json() as Promise<SearchResponse>;
}

export async function getTripSeats(tripId: string): Promise<SeatsResponse> {
  const response = await fetch(`${gatewayBase()}/trips/${tripId}/seats`, {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return response.json() as Promise<SeatsResponse>;
}

export async function createReservation(input: {
  tripId: string;
  seatId: string;
  userId?: string;
  idempotencyKey: string;
}): Promise<Reservation> {
  const response = await fetch(`${gatewayBase()}/reservations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify({
      tripId: input.tripId,
      seatId: input.seatId,
      userId: input.userId ?? 'demo-passenger',
    }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return response.json() as Promise<Reservation>;
}

export async function getReservation(id: string): Promise<Reservation> {
  const response = await fetch(`${gatewayBase()}/reservations/${id}`, {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return response.json() as Promise<Reservation>;
}

export async function createPayment(input: {
  reservationId: string;
  amountCents: number;
  idempotencyKey: string;
}): Promise<Payment> {
  const response = await fetch(`${gatewayBase()}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify({
      reservationId: input.reservationId,
      amountCents: input.amountCents,
      userId: 'demo-passenger',
    }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return response.json() as Promise<Payment>;
}
