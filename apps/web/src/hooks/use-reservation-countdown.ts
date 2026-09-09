'use client';

import { useEffect, useRef, useState } from 'react';
import { getReservation } from '@/api';
import { ReservationStatus, type Reservation } from '@/types';

export function useReservationCountdown(
  reservation: Reservation | null,
  options?: {
    onRefresh?: (reservation: Reservation) => void;
    onExpire?: () => void;
  },
) {
  const [now, setNow] = useState(() => Date.now());
  const expiredForId = useRef<string | null>(null);
  const onRefresh = options?.onRefresh;
  const onExpire = options?.onExpire;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (
      !reservation ||
      (reservation.status !== ReservationStatus.Reserved &&
        reservation.status !== ReservationStatus.PendingPayment) ||
      !onRefresh
    ) {
      return;
    }
    const id = setInterval(() => {
      void getReservation(reservation.id)
        .then(onRefresh)
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(id);
  }, [reservation?.id, reservation?.status, onRefresh]);

  const remainingMs = reservation
    ? Math.max(0, new Date(reservation.expiresAt).getTime() - now)
    : 0;

  useEffect(() => {
    if (!reservation || !onExpire) return;
    if (
      reservation.status !== ReservationStatus.Reserved &&
      reservation.status !== ReservationStatus.PendingPayment
    ) {
      return;
    }
    if (remainingMs > 0) {
      expiredForId.current = null;
      return;
    }
    if (expiredForId.current === reservation.id) return;
    expiredForId.current = reservation.id;
    onExpire();
  }, [reservation, remainingMs, onExpire]);

  const remainingLabel = `${Math.floor(remainingMs / 60000)}:${String(
    Math.floor((remainingMs % 60000) / 1000),
  ).padStart(2, '0')}`;

  return { remainingMs, remainingLabel };
}
