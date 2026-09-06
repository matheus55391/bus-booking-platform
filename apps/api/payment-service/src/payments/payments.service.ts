import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreatePaymentInput } from '@repo/common';
import { CheckoutSagaService } from './checkout-saga.service';
import { PrismaService } from '../prisma/prisma.service';
import { toPaymentResponse } from './payments.mappers';
import { normalizeCreatePaymentInput } from './payments.validators';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checkoutSaga: CheckoutSagaService,
  ) {}

  async create(input: CreatePaymentInput) {
    return this.checkoutSaga.run(normalizeCreatePaymentInput(input));
  }

  async findById(id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException(`payment ${id} not found`);
    return toPaymentResponse(payment, false);
  }
}
