import { searchTrips } from '@/api';
import { SearchForm } from '@/components/search/search-form';
import { TripList } from '@/components/search/trip-list';
import { searchTripsSchema } from '@/schemas';
import styles from './page.module.css';

type SearchParams = Promise<{
  origin?: string;
  destination?: string;
  date?: string;
}>;

const defaults = {
  origin: 'Aracaju',
  destination: 'Salvador',
  date: '2026-09-10',
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = await searchParams;
  const parsed = searchTripsSchema.safeParse({
    origin: raw.origin ?? defaults.origin,
    destination: raw.destination ?? defaults.destination,
    date: raw.date ?? defaults.date,
  });

  const formDefaults = parsed.success ? parsed.data : defaults;

  let result = null;
  let error: string | null = null;

  if (parsed.success) {
    try {
      result = await searchTrips(parsed.data);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Falha na busca';
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.brand}>Rodoviária</p>
        <h1 className={styles.title}>Buscar viagens</h1>
        <p className={styles.subtitle}>
          SSR para busca/lista · Client para reserva
        </p>
      </header>

      <SearchForm defaults={formDefaults} />

      {error ? <p className={styles.error}>{error}</p> : null}

      {result ? <TripList result={result} /> : null}
    </div>
  );
}
