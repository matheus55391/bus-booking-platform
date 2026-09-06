import type { PassengerData, Payment, PaymentMethod } from '@/types';
import { apiUrl, parseApiError } from './client';

export async function createPayment(input: {
  reservationId: string;
  amountCents: number;
  idempotencyKey: string;
  passenger: PassengerData;
  paymentMethod: PaymentMethod;
}): Promise<Payment> {
  const response = await fetch(apiUrl('/payments'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify({
      reservationId: input.reservationId,
      amountCents: input.amountCents,
      passenger: input.passenger,
      paymentMethod: input.paymentMethod,
    }),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  return response.json() as Promise<Payment>;
}
