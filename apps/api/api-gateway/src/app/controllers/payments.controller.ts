import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AppService, PaymentTopics } from '@repo/common';
import { CreatePaymentDto } from '../dto/http.dto';
import { requireIdempotencyKey } from '../pipes/idempotency-key.pipe';
import { RmqClientService } from '../services/rmq-client.service';

@ApiTags('payments')
@Controller('payments')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class PaymentsController {
  constructor(private readonly rmq: RmqClientService) {}

  @Post()
  @ApiOperation({
    summary: 'Iniciar checkout (saga no Payment)',
    description:
      'Rate limit 20/min. Cria Passenger + PENDING_PAYMENT via beginPayment, cobra e publica payment.*.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Preferível pay-{reservationId} no client',
  })
  @ApiOkResponse({ description: 'Payment PENDING/APPROVED/FAILED' })
  create(
    @Body() body: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.rmq.send(AppService.Payment, PaymentTopics.CreatePayment, {
      ...body,
      idempotencyKey: requireIdempotencyKey(idempotencyKey),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar pagamento por id' })
  findById(@Param('id') id: string) {
    return this.rmq.send(AppService.Payment, PaymentTopics.GetPayment, { id });
  }
}
