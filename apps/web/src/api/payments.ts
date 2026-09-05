import type { Payment } from "@/types";
import { apiUrl, parseApiError } from "./client";

export async function createPayment(input: {
  reservationId: string;
  amountCents: number;
  idempotencyKey: string;
}): Promise<Payment> {
  const response = await fetch(apiUrl("/payments"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      reservationId: input.reservationId,
      amountCents: input.amountCents,
      userId: "demo-passenger",
    }),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  return response.json() as Promise<Payment>;
}
