export type PaymentStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'FAILED'
  | 'REFUNDED';

export type CreatePaymentInput = {
  reservationId: string;
  amountCents: number;
  userId?: string;
  idempotencyKey: string;
  /** Simulate failure for demos */
  forceFail?: boolean;
};

/** Resposta HTTP de pagamento (Payment → Gateway → Web). */
export type Payment = {
  id: string;
  reservationId: string;
  amountCents: number;
  status: PaymentStatus | string;
  transactionId: string | null;
  idempotencyKey?: string;
  failureReason?: string | null;
  createdAt?: string;
  idempotentReplay?: boolean;
};
