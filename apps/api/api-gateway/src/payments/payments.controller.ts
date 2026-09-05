import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { PaymentsProxyService } from './payments.proxy.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsProxy: PaymentsProxyService) {}

  @Post()
  create(
    @Body()
    body: {
      reservationId: string;
      amountCents: number;
      userId?: string;
      forceFail?: boolean;
    },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.paymentsProxy.create(body, idempotencyKey);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.paymentsProxy.findById(id);
  }
}
