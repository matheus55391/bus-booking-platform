'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createReservation } from '@/api';
import { newIdempotencyKey } from '@/lib/format';
import type { Reservation, Seat } from '@/types';

type Options = {
  tripId: string;
  onSuccess?: (reservation: Reservation, idempotencyKey: string) => void;
  onError?: (error: Error) => void;
};

export function useCreateReservation({ tripId, onSuccess, onError }: Options) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (seat: Seat) => {
      const idempotencyKey = newIdempotencyKey(`reserve-${seat.id}`);
      const reservation = await createReservation({
        tripId,
        seatId: seat.id,
        idempotencyKey,
      });
      return { reservation, idempotencyKey };
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['trip-seats', tripId] });
      onSuccess?.(data.reservation, data.idempotencyKey);
    },
    onError: (error: Error) => {
      void queryClient.invalidateQueries({ queryKey: ['trip-seats', tripId] });
      onError?.(error);
    },
  });
}
