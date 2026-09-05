"use client";

import { useEffect, useState } from "react";
import { getReservation } from "@/api";
import type { Reservation } from "@/types";

export function useReservationCountdown(
  reservation: Reservation | null,
  onRefresh?: (reservation: Reservation) => void,
) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!reservation || reservation.status !== "RESERVED" || !onRefresh) return;
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

  const remainingLabel = `${Math.floor(remainingMs / 60000)}:${String(
    Math.floor((remainingMs % 60000) / 1000),
  ).padStart(2, "0")}`;

  return { remainingMs, remainingLabel };
}
