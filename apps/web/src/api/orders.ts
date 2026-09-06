import type { Reservation } from '@/types';
import { apiUrl, parseApiError } from './client';

export async function lookupOrder(input: {
  orderCode: string;
  email?: string;
  document?: string;
}): Promise<Reservation> {
  const params = new URLSearchParams({ orderCode: input.orderCode });
  if (input.email) params.set('email', input.email);
  if (input.document) params.set('document', input.document);

  const response = await fetch(apiUrl(`/orders/lookup?${params}`), {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  return response.json() as Promise<Reservation>;
}
