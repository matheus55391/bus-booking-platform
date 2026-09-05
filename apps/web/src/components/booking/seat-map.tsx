"use client";

import { statusLabel } from "@/lib/format";
import type { Seat, SeatStatus } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  seats: Seat[];
  selectedSeatId: string | null;
  disabled?: boolean;
  reservingSeatId: string | null;
  onSelect: (seat: Seat) => void;
};

function seatTone(status: SeatStatus, selected: boolean) {
  if (selected) {
    return "bg-foreground text-background border-foreground ring-2 ring-primary ring-offset-2";
  }
  switch (status) {
    case "AVAILABLE":
      return "bg-primary/25 border-primary/50 text-foreground hover:bg-primary/40";
    case "HELD":
      return "bg-amber-100 border-amber-400 text-amber-900";
    case "SOLD":
      return "bg-muted border-border text-muted-foreground";
  }
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
    const className = cn(
      "inline-flex h-9 items-center justify-center rounded-md border text-xs font-semibold",
      seatTone(seat.status, selected),
    );
    const busy = reservingSeatId === seat.id;

    if (seat.status !== "AVAILABLE") {
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
        className={cn(className, "cursor-pointer disabled:cursor-wait disabled:opacity-75")}
        title={`Reservar ${seat.label}`}
        disabled={
          disabled || Boolean(reservingSeatId) || Boolean(selectedSeatId)
        }
        onClick={() => onSelect(seat)}
      >
        {busy ? "…" : seat.label}
      </button>
    );
  }

  return (
    <div className="flex max-w-xs flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="mb-1 text-center text-sm text-muted-foreground">Frente</div>
      {rows.map(({ row, seats: rowSeats }) => (
        <div
          key={row}
          className="grid grid-cols-[1.2rem_repeat(2,2.4rem)_0.9rem_repeat(2,2.4rem)] items-center gap-1.5"
        >
          <span className="text-xs text-muted-foreground">{row}</span>
          {rowSeats.slice(0, 2).map(renderSeat)}
          <span aria-hidden />
          {rowSeats.slice(2).map(renderSeat)}
        </div>
      ))}
    </div>
  );
}
