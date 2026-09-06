import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreatePaymentInput } from '@repo/common';
import { CheckoutSagaService } from './checkout-saga.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checkoutSaga: CheckoutSagaService,
  ) {}

  async create(input: CreatePaymentInput) {
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

    return this.checkoutSaga.run({
      ...input,
      reservationId,
      idempotencyKey,
      amountCents,
    });
  }

  async findById(id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException(`payment ${id} not found`);
    return {
      id: payment.id,
      reservationId: payment.reservationId,
      amountCents: payment.amountCents,
      status: payment.status,
      transactionId: payment.transactionId,
      idempotencyKey: payment.idempotencyKey,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt.toISOString(),
      idempotentReplay: false,
    };
  }
}
