export function formatMoney(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function formatDuration(departureIso: string, arrivalIso: string) {
  const ms =
    new Date(arrivalIso).getTime() - new Date(departureIso).getTime();
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

export function statusLabel(status: "AVAILABLE" | "HELD" | "SOLD") {
  switch (status) {
    case "AVAILABLE":
      return "Livre";
    case "HELD":
      return "Reservado";
    case "SOLD":
      return "Ocupado";
  }
}

export function newIdempotencyKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}
