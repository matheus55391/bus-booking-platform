"use client";

import { formatDateTime, formatMoney } from "@/lib/format";
import type { Payment, Reservation } from "@/types";
import { Button } from "@/components/ui/button";

type Props = {
  reservation: Reservation;
  payment: Payment | null;
  remainingLabel: string;
  remainingMs: number;
  reserveKey: string | null;
  paying: boolean;
  onPay: () => void;
};

export function CheckoutPanel({
  reservation,
  payment,
  remainingLabel,
  remainingMs,
  reserveKey,
  paying,
  onPay,
}: Props) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-primary/25 bg-secondary/40 p-5">
      <h2 className="font-[family-name:var(--font-heading)] text-xl font-bold">
        Assento selecionado
      </h2>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Assento
          </dt>
          <dd className="mt-1 font-semibold">{reservation.seatLabel}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Status da reserva
          </dt>
          <dd className="mt-1 font-semibold">{reservation.status}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Valor
          </dt>
          <dd className="mt-1 font-semibold">
            {formatMoney(reservation.amountCents)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Expira em
          </dt>
          <dd className="mt-1 font-semibold">
            {reservation.status === "RESERVED" ||
            reservation.status === "PENDING_PAYMENT"
              ? remainingLabel
              : formatDateTime(reservation.expiresAt)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Reservation ID
          </dt>
          <dd className="mt-1 break-all font-mono text-xs font-medium">
            {reservation.id}
          </dd>
        </div>
        {reserveKey ? (
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Idempotency-Key
            </dt>
            <dd className="mt-1 break-all font-mono text-xs font-medium">
              {reserveKey}
            </dd>
          </div>
        ) : null}
      </dl>

      {reservation.status === "RESERVED" && remainingMs > 0 ? (
        <Button
          type="button"
          size="lg"
          className="rounded-full font-bold"
          disabled={paying}
          onClick={onPay}
        >
          {paying ? "Processando pagamento…" : "Pagar agora"}
        </Button>
      ) : null}

      {reservation.status === "PENDING_PAYMENT" ? (
        <p className="rounded-xl bg-accent/40 px-4 py-3 text-sm text-foreground">
          Pagamento em andamento…
        </p>
      ) : null}

      {payment ? (
        <p className="rounded-xl bg-primary/15 px-4 py-3 text-sm text-foreground">
          Pagamento <strong>{payment.status}</strong>
          {payment.transactionId ? ` · txn ${payment.transactionId}` : null}
          {payment.idempotentReplay ? " · replay idempotente" : null}
        </p>
      ) : null}

      {reservation.status === "CONFIRMED" ? (
        <p className="rounded-xl bg-primary/15 px-4 py-3 text-sm text-foreground">
          Reserva confirmada. Assento {reservation.seatLabel} ocupado.
        </p>
      ) : null}

      {reservation.status === "EXPIRED" ||
      reservation.status === "CANCELLED" ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {reservation.status === "CANCELLED"
            ? "Pagamento falhou. Escolha outro assento."
            : "Reserva expirou. Escolha outro assento."}
        </p>
      ) : null}
    </section>
  );
}
