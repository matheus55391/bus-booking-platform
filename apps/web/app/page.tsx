'use client';

import { FormEvent, useMemo, useState } from 'react';
import styles from './page.module.css';

type Trip = {
  id: string;
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  priceCents: number;
  companyName: string;
  availableSeats: number;
};

type SearchResponse = {
  query: { origin: string; destination: string; date: string };
  count: number;
  trips: Trip[];
};

type SeatStatus = 'AVAILABLE' | 'HELD' | 'SOLD';

type Seat = {
  id: string;
  label: string;
  row: number;
  column: number;
  status: SeatStatus;
};

type SeatsResponse = {
  trip: Omit<Trip, 'availableSeats'>;
  summary: { available: number; held: number; sold: number };
  seats: Seat[];
};

const gatewayUrl =
  process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:3001';

function formatMoney(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

function statusLabel(status: SeatStatus) {
  switch (status) {
    case 'AVAILABLE':
      return 'Livre';
    case 'HELD':
      return 'Reservado';
    case 'SOLD':
      return 'Ocupado';
  }
}

export default function Home() {
  const [origin, setOrigin] = useState('Aracaju');
  const [destination, setDestination] = useState('Salvador');
  const [date, setDate] = useState('2026-09-10');
  const [loading, setLoading] = useState(false);
  const [seatsLoading, setSeatsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [seatsData, setSeatsData] = useState<SeatsResponse | null>(null);

  const rows = useMemo(() => {
    if (!seatsData) return [];
    const map = new Map<number, Seat[]>();
    for (const seat of seatsData.seats) {
      const list = map.get(seat.row) ?? [];
      list.push(seat);
      map.set(seat.row, list);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([row, seats]) => ({
        row,
        seats: seats.sort((a, b) => a.column - b.column),
      }));
  }, [seatsData]);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSelectedTripId(null);
    setSeatsData(null);

    const params = new URLSearchParams({ origin, destination, date });

    try {
      const response = await fetch(`${gatewayUrl}/trips/search?${params}`);
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Erro ${response.status}`);
      }
      const data = (await response.json()) as SearchResponse;
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Falha na busca');
    } finally {
      setLoading(false);
    }
  }

  async function onSelectTrip(tripId: string) {
    setSelectedTripId(tripId);
    setSeatsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${gatewayUrl}/trips/${tripId}/seats`);
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Erro ${response.status}`);
      }
      const data = (await response.json()) as SeatsResponse;
      setSeatsData(data);
    } catch (err) {
      setSeatsData(null);
      setError(err instanceof Error ? err.message : 'Falha ao carregar assentos');
    } finally {
      setSeatsLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.brand}>Rodoviária</p>
        <h1 className={styles.title}>Buscar viagens</h1>
        <p className={styles.subtitle}>
          Listagem e mapa de assentos via Gateway → Trip Service
        </p>
      </header>

      <form className={styles.form} onSubmit={onSearch}>
        <label className={styles.field}>
          <span>Origem</span>
          <input
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            required
          />
        </label>
        <label className={styles.field}>
          <span>Destino</span>
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            required
          />
        </label>
        <label className={styles.field}>
          <span>Data</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <button className={styles.submit} type="submit" disabled={loading}>
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {error ? <p className={styles.error}>{error}</p> : null}

      {result ? (
        <section className={styles.results}>
          <h2>
            {result.count} viagem(ns) · {result.query.origin} →{' '}
            {result.query.destination}
          </h2>
          {result.trips.length === 0 ? (
            <p className={styles.empty}>Nenhuma viagem encontrada.</p>
          ) : (
            <ul className={styles.list}>
              {result.trips.map((trip) => {
                const active = trip.id === selectedTripId;
                return (
                  <li key={trip.id}>
                    <button
                      type="button"
                      className={`${styles.trip} ${active ? styles.tripActive : ''}`}
                      onClick={() => onSelectTrip(trip.id)}
                    >
                      <div>
                        <strong>{trip.companyName}</strong>
                        <p>
                          {formatTime(trip.departureAt)} →{' '}
                          {formatTime(trip.arrivalAt)}
                        </p>
                        <p>{trip.availableSeats} assentos livres</p>
                      </div>
                      <div className={styles.price}>
                        {formatMoney(trip.priceCents)}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {selectedTripId ? (
        <section className={styles.seatsSection}>
          <h2>Assentos</h2>
          {seatsLoading ? <p className={styles.empty}>Carregando mapa…</p> : null}
          {seatsData && !seatsLoading ? (
            <>
              <p className={styles.seatsMeta}>
                {seatsData.trip.companyName} · {seatsData.summary.available}{' '}
                livres · {seatsData.summary.held} reservados ·{' '}
                {seatsData.summary.sold} ocupados
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
              </div>
              <div className={styles.bus}>
                <div className={styles.driver}>Frente</div>
                {rows.map(({ row, seats }) => (
                  <div key={row} className={styles.seatRow}>
                    <span className={styles.rowNumber}>{row}</span>
                    {seats.slice(0, 2).map((seat) => (
                      <span
                        key={seat.id}
                        className={`${styles.seat} ${styles[seat.status.toLowerCase() as 'available' | 'held' | 'sold']}`}
                        title={`${seat.label} — ${statusLabel(seat.status)}`}
                      >
                        {seat.label}
                      </span>
                    ))}
                    <span className={styles.aisle} aria-hidden />
                    {seats.slice(2).map((seat) => (
                      <span
                        key={seat.id}
                        className={`${styles.seat} ${styles[seat.status.toLowerCase() as 'available' | 'held' | 'sold']}`}
                        title={`${seat.label} — ${statusLabel(seat.status)}`}
                      >
                        {seat.label}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
