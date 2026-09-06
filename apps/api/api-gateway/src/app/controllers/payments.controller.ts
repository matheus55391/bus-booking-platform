import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  AppService,
  PaymentTopics,
  type PassengerData,
  type PaymentMethod,
} from '@repo/common';
import { requireIdempotencyKey } from '../pipes/idempotency-key.pipe';
import { RmqClientService } from '../services/rmq-client.service';

@Controller('payments')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
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
