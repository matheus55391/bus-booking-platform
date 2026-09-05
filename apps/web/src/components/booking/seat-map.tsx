'use client';

import { statusLabel } from '@/lib/format';
import type { Seat, SeatStatus } from '@/types';
import styles from '@/app/page.module.css';

type Props = {
  seats: Seat[];
  selectedSeatId: string | null;
  disabled?: boolean;
  reservingSeatId: string | null;
  onSelect: (seat: Seat) => void;
};

function seatClass(status: SeatStatus, selected: boolean) {
  const statusClass =
    styles[status.toLowerCase() as 'available' | 'held' | 'sold'];
  return [
    styles.seat,
    statusClass,
    selected ? styles.seatSelected : '',
    status === 'AVAILABLE' ? styles.seatButton : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function SeatMap({
  seats,
  selectedSeatId,
  disabled,
  reservingSeatId,
  onSelect,
}: Props) {
  const rowsMap = new Map<number, Seat[]>();
  for (const seat of seats) {
    const list = rowsMap.get(seat.row) ?? [];
    list.push(seat);
    rowsMap.set(seat.row, list);
  }
  const rows = [...rowsMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([row, rowSeats]) => ({
      row,
      seats: rowSeats.sort((a, b) => a.column - b.column),
    }));

  function renderSeat(seat: Seat) {
    const selected = selectedSeatId === seat.id;
    const className = seatClass(seat.status, selected);
    const busy = reservingSeatId === seat.id;

    if (seat.status !== 'AVAILABLE') {
      return (
        <span
          key={seat.id}
          className={className}
          title={`${seat.label} — ${statusLabel(seat.status)}`}
        >
          {seat.label}
        </span>
      );
    }

    return (
      <button
        key={seat.id}
        type="button"
        className={className}
        title={`Reservar ${seat.label}`}
        disabled={disabled || Boolean(reservingSeatId) || Boolean(selectedSeatId)}
        onClick={() => onSelect(seat)}
      >
        {busy ? '…' : seat.label}
      </button>
    );
  }

  return (
    <div className={styles.bus}>
      <div className={styles.driver}>Frente</div>
      {rows.map(({ row, seats: rowSeats }) => (
        <div key={row} className={styles.seatRow}>
          <span className={styles.rowNumber}>{row}</span>
          {rowSeats.slice(0, 2).map(renderSeat)}
          <span className={styles.aisle} aria-hidden />
          {rowSeats.slice(2).map(renderSeat)}
        </div>
      ))}
    </div>
  );
}
