import type { PaymentStatus } from '@bus/payment-prisma';

export interface PaymentRecord {
  id: string;
  reservationId: string;
  amountCents: number;
  status: PaymentStatus;
  transactionId: string | null;
  idempotencyKey: string;
  failureReason: string | null;
  createdAt: Date;
}

export interface PaymentResponse {
  id: string;
  reservationId: string;
  amountCents: number;
  status: PaymentStatus;
  transactionId: string | null;
  idempotencyKey: string;
  failureReason: string | null;
  createdAt: string;
  idempotentReplay: boolean;
}

export interface PspWebhookResponse {
  ok: true;
  idempotentReplay: boolean;
  providerEventId: string;
  paymentId: string;
  paymentStatus: PaymentStatus | string | null;
}
