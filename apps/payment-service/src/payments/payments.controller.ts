import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

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
    return this.paymentsService.create({
      ...body,
      idempotencyKey: idempotencyKey ?? '',
    });
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.paymentsService.findById(id);
  }
}
