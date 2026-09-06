import { BadRequestException } from '@nestjs/common';
import type { CreatePaymentInput } from '@repo/common';

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function normalizeCreatePaymentInput(
  input: CreatePaymentInput,
): CreatePaymentInput {
  const reservationId = input.reservationId?.trim();
  const idempotencyKey = input.idempotencyKey?.trim();
  const amountCents = Number(input.amountCents);

  if (!reservationId) {
    throw new BadRequestException('reservationId is required');
  }
  if (!idempotencyKey) {
    throw new BadRequestException('Idempotency-Key is required');
  }
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new BadRequestException('amountCents must be > 0');
  }
  if (!input.passenger || !input.paymentMethod) {
    throw new BadRequestException('passenger and paymentMethod are required');
  }

  return {
    ...input,
    reservationId,
    idempotencyKey,
    amountCents,
  };
}

export function assertSagaInput(input: CreatePaymentInput): void {
  if (!input.reservationId?.trim() || !input.idempotencyKey?.trim()) {
    throw new Error('reservationId and idempotencyKey required');
  }
  if (!input.passenger || !input.paymentMethod) {
    throw new Error('passenger and paymentMethod required');
  }
}
