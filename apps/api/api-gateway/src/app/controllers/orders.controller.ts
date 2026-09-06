import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AppService, BookingTopics } from '@repo/common';
import { RmqClientService } from '../services/rmq-client.service';

@Controller('orders')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class OrdersController {
  constructor(private readonly rmq: RmqClientService) {}

  @Get('lookup')
  lookup(
    @Query('orderCode') orderCode?: string,
    @Query('email') email?: string,
    @Query('document') document?: string,
  ) {
    return this.rmq.send(AppService.Booking, BookingTopics.LookupReservation, {
      orderCode,
      email,
      document,
    });
  }
}
