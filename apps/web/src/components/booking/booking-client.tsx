'use client';

import Link from 'next/link';
import { ClockAlert } from 'lucide-react';
import { useCallback, useState } from 'react';
import {
  useCreatePayment,
  useCreateReservation,
  useReservationCountdown,
  useTripSeats,
} from '@/hooks';
import type { PassengerFormInput } from '@/schemas';
import type { Payment, Reservation, SeatsResponse } from '@/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CheckoutPanel } from './checkout-panel';
import { SeatMap } from './seat-map';

type Props = {
  tripId: string;
  initialSeats: SeatsResponse;
};

export function BookingClient({ tripId, initialSeats }: Props) {
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [holdExpired, setHoldExpired] = useState(false);

  const seatsQuery = useTripSeats(tripId, initialSeats);
  const refetchSeats = seatsQuery.refetch;
  const onRefresh = useCallback((next: Reservation) => {
    setReservation(next);
  }, []);

  const onExpire = useCallback(() => {
    setReservation(null);
    setPayment(null);
    setHoldExpired(true);
    void refetchSeats();
  }, [refetchSeats]);

  const { remainingMs, remainingLabel } = useReservationCountdown(reservation, {
    onRefresh,
    onExpire,
  });

  const reserveMutation = useCreateReservation({
    tripId,
    onSuccess: (created) => {
      setReservation(created);
      setPayment(null);
      setError(null);
      setHoldExpired(false);
    },
    onError: (err) => setError(err.message),
  });

  const payMutation = useCreatePayment({
    tripId,
    onReservationUpdate: setReservation,
    onSuccess: (created, nextReservation) => {
      setPayment(created);
      setReservation(nextReservation);
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const seatsData = seatsQuery.data ?? initialSeats;

  function handlePay(form: PassengerFormInput) {
    if (!reservation) return;
    payMutation.mutate({ reservation, form });
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">
          Rodoviária
        </p>
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold tracking-tight sm:text-4xl">
          {seatsData.trip.origin} → {seatsData.trip.destination}
        </h1>
        <p className="text-muted-foreground">
          {seatsData.trip.companyName} · selecione um assento livre
        </p>
        <Link
          href="/"
          className={buttonVariants({
            variant: 'link',
            className: 'h-auto w-fit px-0',
          })}
        >
          ← Voltar à busca
        </Link>
      </header>

      {holdExpired ? (
        <Alert variant="destructive">
          <ClockAlert />
          <AlertTitle>Tempo esgotado</AlertTitle>
          <AlertDescription>
            Sua reserva temporária expirou e o assento foi liberado. Escolha
            novamente um assento livre para continuar.
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div>
          <h2 className="font-[family-name:var(--font-heading)] text-xl font-bold">
            Assentos
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Clique em um assento livre: ele fica reservado para você por 10
            minutos.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {seatsData.summary.available} livres · {seatsData.summary.held}{' '}
            reservados · {seatsData.summary.sold} ocupados
          </p>
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          <LegendSwatch
            className="bg-primary/25 border-primary/50"
            label="Livre"
          />
          <LegendSwatch
            className="bg-amber-100 border-amber-400"
            label="Reservado"
          />
          <LegendSwatch className="bg-muted border-border" label="Ocupado" />
          <LegendSwatch
            className="bg-foreground border-foreground"
            label="Seu assento"
          />
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
          paying={payMutation.isPending}
          onPay={handlePay}
        />
      ) : null}
    </div>
  );
}

function LegendSwatch({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn('size-3 rounded-sm border', className)} aria-hidden />
      {label}
    </span>
  );
}
