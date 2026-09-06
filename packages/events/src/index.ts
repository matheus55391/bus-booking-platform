/** Fanout de domínio: 1 exchange, N filas (uma por consumidor). */
export const EXCHANGE = "bus.fanout";
export const EXCHANGE_TYPE = "fanout" as const;

/** Tipo do evento (vai no payload + routing key da mensagem; fanout ignora a key p/ roteamento). */
export const RoutingKeys = {
  SeatReserved: "seat.reserved",
  SeatConfirmed: "seat.confirmed",
  SeatReleased: "seat.released",
  PaymentRequested: "payment.requested",
  PaymentApproved: "payment.approved",
  PaymentFailed: "payment.failed",
} as const;

export type SeatReservedEvent = {
  eventId: string;
  type: typeof RoutingKeys.SeatReserved;
  occurredAt: string;
  reservationId: string;
  tripId: string;
  seatId: string;
  seatLabel: string;
  userId: string;
  expiresAt: string;
  amountCents: number;
};

export type SeatConfirmedEvent = {
  eventId: string;
  type: typeof RoutingKeys.SeatConfirmed;
  occurredAt: string;
  reservationId: string;
  tripId: string;
  seatId: string;
  seatLabel?: string;
  orderCode?: string;
  passengerName?: string;
  passengerEmail?: string;
  amountCents?: number;
};

export type SeatReleasedEvent = {
  eventId: string;
  type: typeof RoutingKeys.SeatReleased;
  occurredAt: string;
  reservationId: string;
  tripId: string;
  seatId: string;
  reason: "EXPIRED" | "CANCELLED";
};

export type PaymentRequestedEvent = {
  eventId: string;
  type: typeof RoutingKeys.PaymentRequested;
  occurredAt: string;
  reservationId: string;
  amountCents: number;
  userId: string;
  idempotencyKey: string;
};

export type PaymentApprovedEvent = {
  eventId: string;
  type: typeof RoutingKeys.PaymentApproved;
  occurredAt: string;
  paymentId: string;
  reservationId: string;
  amountCents: number;
  transactionId: string;
  orderCode?: string;
  passengerName?: string;
  passengerEmail?: string;
  seatLabel?: string;
};

export type PaymentFailedEvent = {
  eventId: string;
  type: typeof RoutingKeys.PaymentFailed;
  occurredAt: string;
  paymentId: string;
  reservationId: string;
  reason: string;
};
