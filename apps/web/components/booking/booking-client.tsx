'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  createPayment,
  createReservation,
  getReservation,
  getTripSeats,
} from '../../lib/api';
import { newIdempotencyKey } from '../../lib/format';
import type { Payment, Reservation, Seat, SeatsResponse } from '../../lib/types';
import styles from '../../app/page.module.css';
import { CheckoutPanel } from './checkout-panel';
import { SeatMap } from './seat-map';

type Props = {
  tripId: string;
  initialSeats: SeatsResponse;
};

export function BookingClient({ tripId, initialSeats }: Props) {
  const queryClient = useQueryClient();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [reserveKey, setReserveKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const seatsQuery = useQuery({
    queryKey: ['trip-seats', tripId],
    queryFn: () => getTripSeats(tripId),
    initialData: initialSeats,
  });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!reservation || reservation.status !== 'RESERVED') return;
    const id = setInterval(() => {
      void getReservation(reservation.id)
        .then(setReservation)
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(id);
  }, [reservation?.id, reservation?.status]);

  const reserveMutation = useMutation({
    mutationFn: async (seat: Seat) => {
      const key = newIdempotencyKey(`reserve-${seat.id}`);
      setReserveKey(key);
      return createReservation({
        tripId,
        seatId: seat.id,
        idempotencyKey: key,
      });
    },
    onSuccess: async (created) => {
      setReservation(created);
      setPayment(null);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['trip-seats', tripId] });
    },
    onError: (err: Error) => {
      setError(err.message);
      void queryClient.invalidateQueries({ queryKey: ['trip-seats', tripId] });
    },
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!reservation) throw new Error('Sem reserva');
      const key = newIdempotencyKey(`pay-${reservation.id}`);
      const created = await createPayment({
        reservationId: reservation.id,
        amountCents: reservation.amountCents,
        idempotencyKey: key,
      });

      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 400));
        const current = await getReservation(reservation.id);
        setReservation(current);
        if (current.status === 'CONFIRMED') break;
      }

      return created;
    },
    onSuccess: async (created) => {
      setPayment(created);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['trip-seats', tripId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const seatsData = seatsQuery.data;
  const remainingMs = reservation
    ? Math.max(0, new Date(reservation.expiresAt).getTime() - now)
    : 0;
  const remainingLabel = `${Math.floor(remainingMs / 60000)}:${String(
    Math.floor((remainingMs % 60000) / 1000),
  ).padStart(2, '0')}`;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.brand}>Rodoviária</p>
        <h1 className={styles.title}>
          {seatsData.trip.origin} → {seatsData.trip.destination}
        </h1>
        <p className={styles.subtitle}>
          {seatsData.trip.companyName} · selecione um assento livre
        </p>
        <Link href="/" className={styles.backLink}>
          ← Voltar à busca
        </Link>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.seatsSection}>
        <h2>Assentos</h2>
        <p className={styles.hint}>
          Clique em um assento livre: ele fica reservado para você por 10
          minutos.
        </p>
        <p className={styles.seatsMeta}>
          {seatsData.summary.available} livres · {seatsData.summary.held}{' '}
          reservados · {seatsData.summary.sold} ocupados
        </p>
        <div className={styles.legend}>
          <span className={`${styles.legendItem} ${styles.available}`}>
            Livre
          </span>
          <span className={`${styles.legendItem} ${styles.held}`}>
            Reservado
          </span>
          <span className={`${styles.legendItem} ${styles.sold}`}>
            Ocupado
          </span>
          <span className={`${styles.legendItem} ${styles.selectedLegend}`}>
            Seu assento
          </span>
        </div>
        <SeatMap
          seats={seatsData.seats}
          selectedSeatId={reservation?.seatId ?? null}
          reservingSeatId={reserveMutation.isPending ? reserveMutation.variables?.id ?? null : null}
          disabled={Boolean(reservation)}
          onSelect={(seat) => reserveMutation.mutate(seat)}
        />
      </section>

      {reservation ? (
        <CheckoutPanel
          reservation={reservation}
          payment={payment}
          remainingLabel={remainingLabel}
          remainingMs={remainingMs}
          reserveKey={reserveKey}
          paying={payMutation.isPending}
          onPay={() => payMutation.mutate()}
        />
      ) : null}
    </div>
  );
}
