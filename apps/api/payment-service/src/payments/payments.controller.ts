import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PaymentTopics } from '@repo/common';
import type { CreatePaymentInput } from '@repo/common';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @MessagePattern(PaymentTopics.CreatePayment)
  create(@Payload() input: CreatePaymentInput) {
    return this.paymentsService.create(input);
  }

  @MessagePattern(PaymentTopics.GetPayment)
  findById(@Payload() data: { id: string }) {
    return this.paymentsService.findById(data.id);
  }
}
