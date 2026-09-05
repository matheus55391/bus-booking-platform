import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import { formatDuration, formatMoney, formatTime } from "@/lib/format";
import type { SearchResponse } from "@/types";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  result: SearchResponse;
};

export function TripList({ result }: Props) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {result.query.origin} → {result.query.destination} ·{" "}
            {result.query.date}
          </p>
          <h2 className="font-[family-name:var(--font-heading)] text-2xl font-bold tracking-tight">
            {result.count} {result.count === 1 ? "resultado" : "resultados"}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <SortChip active>Horário</SortChip>
          <SortChip>Preço</SortChip>
          <SortChip>Duração</SortChip>
        </div>
      </div>

      {result.trips.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhuma viagem encontrada para esta busca.
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {result.trips.map((trip) => (
            <li key={trip.id}>
              <Card className="overflow-hidden border-border/80 py-0 shadow-sm transition hover:border-primary/50 hover:shadow-md">
                <CardContent className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6 sm:p-5">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-[family-name:var(--font-heading)] text-sm font-bold uppercase tracking-wide text-foreground">
                        {trip.companyName}
                      </p>
                      <Badge
                        variant="secondary"
                        className="rounded-full text-xs font-medium"
                      >
                        {trip.availableSeats} livres
                      </Badge>
                    </div>

                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                      <div>
                        <p className="font-[family-name:var(--font-heading)] text-3xl font-bold tabular-nums leading-none">
                          {formatTime(trip.departureAt)}
                        </p>
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          {trip.origin}
                        </p>
                      </div>

                      <div className="flex min-w-20 flex-col items-center gap-1 px-1">
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock3 className="size-3.5" aria-hidden />
                          {formatDuration(trip.departureAt, trip.arrivalAt)}
                        </p>
                        <div className="flex w-full items-center gap-1">
                          <span className="size-2 rounded-full bg-primary" />
                          <span className="h-px flex-1 bg-border" />
                          <span className="size-2 rounded-full border-2 border-primary bg-card" />
                        </div>
                        <p className="text-[11px] font-medium text-muted-foreground">
                          Direto
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="font-[family-name:var(--font-heading)] text-3xl font-bold tabular-nums leading-none">
                          {formatTime(trip.arrivalAt)}
                        </p>
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          {trip.destination}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 border-t pt-4 sm:flex-col sm:items-end sm:justify-center sm:border-t-0 sm:border-l sm:pl-6 sm:pt-0">
                    <div className="text-left sm:text-right">
                      <p className="text-xs text-muted-foreground">a partir de</p>
                      <p className="font-[family-name:var(--font-heading)] text-3xl font-bold tracking-tight">
                        {formatMoney(trip.priceCents)}
                      </p>
                    </div>
                    <Link
                      href={`/trips/${trip.id}`}
                      prefetch={false}
                      className={buttonVariants({
                        className: "rounded-full px-6 font-bold",
                      })}
                    >
                      Selecionar
                      <ArrowRight data-icon="inline-end" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SortChip({
  children,
  active = false,
}: {
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <span
      className={
        active
          ? "rounded-full border border-primary bg-primary/15 px-3 py-1 text-sm font-semibold text-foreground"
          : "rounded-full border border-border bg-card px-3 py-1 text-sm text-muted-foreground"
      }
    >
      {children}
    </span>
  );
}
