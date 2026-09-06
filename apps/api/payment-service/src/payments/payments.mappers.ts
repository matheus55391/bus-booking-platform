import { randomUUID } from 'crypto';
import {
  RoutingKeys,
  type PaymentApprovedEvent,
  type PaymentFailedEvent,
} from '@repo/events';
import type {
  PaymentRecord,
  PaymentResponse,
  PspWebhookResponse,
} from './payments.types';

export function toPaymentResponse(
  payment: PaymentRecord,
  idempotentReplay: boolean,
): PaymentResponse {
  return {
    id: payment.id,
    reservationId: payment.reservationId,
    amountCents: payment.amountCents,
    status: payment.status,
    transactionId: payment.transactionId,
    idempotencyKey: payment.idempotencyKey,
    failureReason: payment.failureReason,
    createdAt: payment.createdAt.toISOString(),
    idempotentReplay,
  };
}

export function toPspWebhookResponse(input: {
  providerEventId: string;
  paymentId: string;
  paymentStatus: PaymentResponse['status'] | string | null;
  idempotentReplay: boolean;
}): PspWebhookResponse {
  return {
    ok: true,
    idempotentReplay: input.idempotentReplay,
    providerEventId: input.providerEventId,
    paymentId: input.paymentId,
    paymentStatus: input.paymentStatus,
  };
}

export function toPaymentApprovedEvent(input: {
  paymentId: string;
  reservationId: string;
  amountCents: number;
  transactionId: string;
  orderCode?: string;
  passengerName?: string;
  passengerEmail?: string;
  seatLabel?: string;
}): PaymentApprovedEvent {
  return {
    eventId: randomUUID(),
    type: RoutingKeys.PaymentApproved,
    occurredAt: new Date().toISOString(),
    paymentId: input.paymentId,
    reservationId: input.reservationId,
    amountCents: input.amountCents,
    transactionId: input.transactionId,
    orderCode: input.orderCode,
    passengerName: input.passengerName,
    passengerEmail: input.passengerEmail,
    seatLabel: input.seatLabel,
  };
}

export function toPaymentFailedEvent(input: {
  paymentId: string;
  reservationId: string;
  reason: string;
}): PaymentFailedEvent {
  return {
    eventId: randomUUID(),
    type: RoutingKeys.PaymentFailed,
    occurredAt: new Date().toISOString(),
    paymentId: input.paymentId,
    reservationId: input.reservationId,
    reason: input.reason,
  };
}

export function newTransactionId(): string {
  return `txn_${randomUUID().slice(0, 8)}`;
}
