import type { PassengerData, PaymentMethod } from './reservation';

export enum PaymentStatus {
  Pending = 'PENDING',
  Approved = 'APPROVED',
  Failed = 'FAILED',
  Refunded = 'REFUNDED',
}

/** Status aceitos no callback do PSP. */
export enum PspWebhookStatus {
  Approved = 'APPROVED',
  Failed = 'FAILED',
}

export type CreatePaymentInput = {
  reservationId: string;
  amountCents: number;
  userId?: string;
  idempotencyKey: string;
  passenger: PassengerData;
  paymentMethod: PaymentMethod;
  /** Simulate failure for demos (sync charge) */
  forceFail?: boolean;
  /**
   * Se true: cria Payment PENDING e espera `POST /webhooks/psp`
   * (fluxo async de PSP). Default false = charge mock síncrono.
   */
  asyncCharge?: boolean;
};

/** Callback do provedor de pagamento (mock ou real). */
export type PspWebhookInput = {
  /** Chave de dedupe do provedor (obrigatória). */
  providerEventId: string;
  provider?: string;
  paymentId: string;
  status: PspWebhookStatus;
  transactionId?: string;
  failureReason?: string;
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
