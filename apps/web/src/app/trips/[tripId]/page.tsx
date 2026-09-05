import Link from 'next/link';
import { getTripSeats } from '@/api';
import { BookingClient } from '@/components/booking/booking-client';
import styles from '../../page.module.css';

type Params = Promise<{ tripId: string }>;

export default async function TripBookingPage({
  params,
}: {
  params: Params;
}) {
  const { tripId } = await params;

  try {
    const initialSeats = await getTripSeats(tripId);
    return <BookingClient tripId={tripId} initialSeats={initialSeats} />;
  } catch (err) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <p className={styles.brand}>Rodoviária</p>
          <h1 className={styles.title}>Viagem não encontrada</h1>
          <p className={styles.subtitle}>
            {err instanceof Error ? err.message : 'Erro ao carregar assentos'}
          </p>
          <Link href="/" className={styles.backLink}>
            ← Voltar à busca
          </Link>
        </header>
      </div>
    );
  }
}
