'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import {
  useCreatePayment,
  useCreateReservation,
  useReservationCountdown,
  useTripSeats,
} from '@/hooks';
import type { Payment, Reservation, SeatsResponse } from '@/types';
import styles from '@/app/page.module.css';
import { CheckoutPanel } from './checkout-panel';
import { SeatMap } from './seat-map';

type Props = {
  tripId: string;
  initialSeats: SeatsResponse;
};

export function BookingClient({ tripId, initialSeats }: Props) {
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [reserveKey, setReserveKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const seatsQuery = useTripSeats(tripId, initialSeats);
  const onRefresh = useCallback((next: Reservation) => {
    setReservation(next);
  }, []);
  const { remainingMs, remainingLabel } = useReservationCountdown(
    reservation,
    onRefresh,
  );

  const reserveMutation = useCreateReservation({
    tripId,
    onSuccess: (created, idempotencyKey) => {
      setReservation(created);
      setReserveKey(idempotencyKey);
      setPayment(null);
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const payMutation = useCreatePayment({
    tripId,
    onReservationUpdate: setReservation,
    onSuccess: (created) => {
      setPayment(created);
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const seatsData = seatsQuery.data ?? initialSeats;

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
          reservingSeatId={
            reserveMutation.isPending
              ? (reserveMutation.variables?.id ?? null)
              : null
          }
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
          onPay={() => payMutation.mutate(reservation)}
        />
      ) : null}
    </div>
  );
}
