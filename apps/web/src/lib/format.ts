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
