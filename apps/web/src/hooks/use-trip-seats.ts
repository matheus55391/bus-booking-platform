'use client';

import { useQuery } from '@tanstack/react-query';
import { getTripSeats } from '@/api';
import type { SeatsResponse } from '@/types';

export function useTripSeats(tripId: string, initialData?: SeatsResponse) {
  return useQuery({
    queryKey: ['trip-seats', tripId],
    queryFn: () => getTripSeats(tripId),
    initialData,
  });
}
