import { searchTrips } from "@/api";
import { SearchForm } from "@/components/search/search-form";
import { TripList } from "@/components/search/trip-list";
import { searchTripsSchema } from "@/schemas";

type SearchParams = Promise<{
  origin?: string;
  destination?: string;
  date?: string;
}>;

const defaults = {
  origin: "Aracaju",
  destination: "Salvador",
  date: "2026-09-10",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = await searchParams;
  const hasQuery = Boolean(raw.origin || raw.destination || raw.date);
  const parsed = searchTripsSchema.safeParse({
    origin: raw.origin ?? defaults.origin,
    destination: raw.destination ?? defaults.destination,
    date: raw.date ?? defaults.date,
  });

  const formDefaults = parsed.success ? parsed.data : defaults;

  let result = null;
  let error: string | null = null;

  if (hasQuery && parsed.success) {
    try {
      result = await searchTrips(parsed.data);
    } catch (err) {
      error = err instanceof Error ? err.message : "Falha na busca";
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
      <section className="flex flex-col gap-6">
        <div className="max-w-2xl">
          <h1 className="font-[family-name:var(--font-heading)] text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Rodoviária
          </h1>
          <p className="mt-3 max-w-xl text-base text-muted-foreground sm:text-lg">
            Compare horários e preços e reserve seu assento em poucos minutos.
          </p>
        </div>

        <SearchForm defaults={formDefaults} />
      </section>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {result ? <TripList result={result} /> : null}
    </div>
  );
}
