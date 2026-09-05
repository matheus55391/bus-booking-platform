import Link from "next/link";
import { formatMoney, formatTime } from "@/lib/format";
import type { SearchResponse } from "@/types";
import styles from "@/app/page.module.css";

type Props = {
  result: SearchResponse;
};

export function TripList({ result }: Props) {
  return (
    <section className={styles.results}>
      <h2>
        {result.count} viagem(ns) · {result.query.origin} →{" "}
        {result.query.destination}
      </h2>
      {result.trips.length === 0 ? (
        <p className={styles.empty}>Nenhuma viagem encontrada.</p>
      ) : (
        <ul className={styles.list}>
          {result.trips.map((trip) => (
            <li key={trip.id}>
              <Link
                href={`/trips/${trip.id}`}
                className={styles.trip}
                prefetch={false}
              >
                <div>
                  <strong>{trip.companyName}</strong>
                  <p>
                    {formatTime(trip.departureAt)} →{" "}
                    {formatTime(trip.arrivalAt)}
                  </p>
                  <p>{trip.availableSeats} assentos livres</p>
                </div>
                <div className={styles.price}>
                  {formatMoney(trip.priceCents)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
