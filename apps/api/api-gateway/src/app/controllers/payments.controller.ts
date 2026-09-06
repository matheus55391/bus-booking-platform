import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import {
  AppService,
  PaymentTopics,
  type PassengerData,
  type PaymentMethod,
} from '@repo/common';
import { requireIdempotencyKey } from '../pipes/idempotency-key.pipe';
import { RmqClientService } from '../services/rmq-client.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly rmq: RmqClientService) {}

  @Post()
  create(
    @Body()
    body: {
      reservationId: string;
      amountCents: number;
      userId?: string;
      forceFail?: boolean;
      passenger: PassengerData;
      paymentMethod: PaymentMethod;
    },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.rmq.send(AppService.Payment, PaymentTopics.CreatePayment, {
      ...body,
      idempotencyKey: requireIdempotencyKey(idempotencyKey),
    });
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.rmq.send(AppService.Payment, PaymentTopics.GetPayment, { id });
  }
}
