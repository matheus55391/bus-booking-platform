import Link from 'next/link';
import { getTripSeats } from '@/api';
import { BookingClient } from '@/components/booking/booking-client';
import { buttonVariants } from '@/components/ui/button';

type Params = Promise<{ tripId: string }>;

export default async function TripBookingPage({ params }: { params: Params }) {
  const { tripId } = await params;

  try {
    const initialSeats = await getTripSeats(tripId);
    return <BookingClient tripId={tripId} initialSeats={initialSeats} />;
  } catch (err) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-10 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">
          Rodoviária
        </p>
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold tracking-tight">
          Viagem não encontrada
        </h1>
        <p className="text-muted-foreground">
          {err instanceof Error ? err.message : 'Erro ao carregar assentos'}
        </p>
        <Link
          href="/"
          className={buttonVariants({
            variant: 'outline',
            className: 'w-fit rounded-full',
          })}
        >
          ← Voltar à busca
        </Link>
      </div>
    );
  }
}
