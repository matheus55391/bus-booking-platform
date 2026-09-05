'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createPayment, getReservation } from '@/api';
import { newIdempotencyKey } from '@/lib/format';
import type { Payment, Reservation } from '@/types';

type Options = {
  tripId: string;
  onReservationUpdate?: (reservation: Reservation) => void;
  onSuccess?: (payment: Payment) => void;
  onError?: (error: Error) => void;
};

export function useCreatePayment({
  tripId,
  onReservationUpdate,
  onSuccess,
  onError,
}: Options) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reservation: Reservation) => {
      const idempotencyKey = newIdempotencyKey(`pay-${reservation.id}`);
      const payment = await createPayment({
        reservationId: reservation.id,
        amountCents: reservation.amountCents,
        idempotencyKey,
      });

      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 400));
        const current = await getReservation(reservation.id);
        onReservationUpdate?.(current);
        if (current.status === 'CONFIRMED') break;
      }

      return payment;
    },
    onSuccess: async (payment) => {
      await queryClient.invalidateQueries({ queryKey: ['trip-seats', tripId] });
      onSuccess?.(payment);
    },
    onError: (error: Error) => onError?.(error),
  });
}
