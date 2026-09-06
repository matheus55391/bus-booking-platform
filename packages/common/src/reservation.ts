export enum ReservationStatus {
  Reserved = 'RESERVED',
  PendingPayment = 'PENDING_PAYMENT',
  Confirmed = 'CONFIRMED',
  Expired = 'EXPIRED',
  Cancelled = 'CANCELLED',
}

export enum PaymentMethod {
  Pix = 'PIX',
  CreditCard = 'CREDIT_CARD',
}

/** Dados do passageiro no request de pagamento / beginPayment. */
export type PassengerData = {
  name: string;
  email: string;
  document: string;
  phone: string;
  /** YYYY-MM-DD */
  birthDate: string;
};

/** Passageiro persistido (resposta HTTP). */
export type Passenger = PassengerData & {
  id: string;
};

export type CreateReservationInput = {
  tripId: string;
  seatId: string;
  userId?: string;
  idempotencyKey: string;
};

export type BeginPaymentInput = {
  reservationId: string;
  passenger: PassengerData;
  paymentMethod: PaymentMethod;
};

/** Compensação da saga de checkout (após beginPayment). */
export type CompensateCheckoutInput = {
  reservationId: string;
  reason: string;
};

export type LookupReservationInput = {
  orderCode: string;
  email?: string;
  document?: string;
};

/** Resposta HTTP de reserva (Booking → Gateway → Web). */
export type Reservation = {
  id: string;
  tripId: string;
  seatId: string;
  seatLabel: string | null;
  userId?: string;
  amountCents: number;
  status: ReservationStatus | string;
  expiresAt: string;
  createdAt?: string;
  holdMinutes: number;
  idempotencyKey?: string;
  idempotentReplay?: boolean;
  orderCode?: string | null;
  paymentMethod?: PaymentMethod | string | null;
  passenger?: Passenger | null;
};
