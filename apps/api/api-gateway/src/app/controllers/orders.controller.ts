import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AppService, BookingTopics } from '@repo/common';
import { LookupOrderQueryDto } from '../dto/http.dto';
import { RmqClientService } from '../services/rmq-client.service';

@ApiTags('orders')
@Controller('orders')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class OrdersController {
  constructor(private readonly rmq: RmqClientService) {}

  @Get('lookup')
  @ApiOperation({
    summary: 'Consultar pedido guest',
    description: 'orderCode + e-mail ou CPF. Rate limit 20/min.',
  })
  @ApiOkResponse({ description: 'Reservation + passenger' })
  lookup(@Query() query: LookupOrderQueryDto) {
    return this.rmq.send(AppService.Booking, BookingTopics.LookupReservation, {
      orderCode: query.orderCode,
      email: query.email,
      document: query.document,
    });
  }
}
