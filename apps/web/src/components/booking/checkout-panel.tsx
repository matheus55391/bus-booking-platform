'use client';

import { formatDateTime, formatMoney } from '@/lib/format';
import type { Payment, Reservation } from '@/types';
import styles from '@/app/page.module.css';

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
    <section className={styles.checkout}>
      <h2>Assento selecionado</h2>
      <dl className={styles.checkoutGrid}>
        <div>
          <dt>Assento</dt>
          <dd>{reservation.seatLabel}</dd>
        </div>
        <div>
          <dt>Status da reserva</dt>
          <dd>{reservation.status}</dd>
        </div>
        <div>
          <dt>Valor</dt>
          <dd>{formatMoney(reservation.amountCents)}</dd>
        </div>
        <div>
          <dt>Expira em</dt>
          <dd>
            {reservation.status === 'RESERVED'
              ? remainingLabel
              : formatDateTime(reservation.expiresAt)}
          </dd>
        </div>
        <div>
          <dt>Reservation ID</dt>
          <dd className={styles.mono}>{reservation.id}</dd>
        </div>
        {reserveKey ? (
          <div>
            <dt>Idempotency-Key</dt>
            <dd className={styles.mono}>{reserveKey}</dd>
          </div>
        ) : null}
      </dl>

      {reservation.status === 'RESERVED' && remainingMs > 0 ? (
        <button
          type="button"
          className={styles.payButton}
          disabled={paying}
          onClick={onPay}
        >
          {paying ? 'Processando pagamento…' : 'Pagar agora'}
        </button>
      ) : null}

      {payment ? (
        <p className={styles.success}>
          Pagamento <strong>{payment.status}</strong>
          {payment.transactionId ? ` · txn ${payment.transactionId}` : null}
          {payment.idempotentReplay ? ' · replay idempotente' : null}
        </p>
      ) : null}

      {reservation.status === 'CONFIRMED' ? (
        <p className={styles.success}>
          Reserva confirmada. Assento {reservation.seatLabel} ocupado.
        </p>
      ) : null}

      {reservation.status === 'EXPIRED' ? (
        <p className={styles.error}>
          Reserva expirou. Escolha outro assento.
        </p>
      ) : null}
    </section>
  );
}
