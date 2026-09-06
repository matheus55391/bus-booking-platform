import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AppService, PaymentTopics } from '@repo/common';
import { PspWebhookDto } from '../dto/http.dto';
import { RmqClientService } from '../services/rmq-client.service';

@ApiTags('webhooks')
@Controller('webhooks')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class WebhooksController {
  constructor(private readonly rmq: RmqClientService) {}

  @Post('psp')
  @ApiOperation({
    summary: 'Callback do PSP (idempotente por providerEventId)',
    description:
      'Completa Payment PENDING criado com asyncCharge=true. Replays com o mesmo providerEventId são no-op.',
  })
  @ApiOkResponse({ description: '{ ok, idempotentReplay, paymentStatus }' })
  handlePsp(@Body() body: PspWebhookDto) {
    return this.rmq.send(
      AppService.Payment,
      PaymentTopics.HandlePspWebhook,
      body,
    );
  }
}
