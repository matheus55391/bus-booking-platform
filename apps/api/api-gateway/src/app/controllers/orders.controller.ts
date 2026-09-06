import { Controller, Get, Query } from '@nestjs/common';
import { AppService, BookingTopics } from '@repo/common';
import { RmqClientService } from '../services/rmq-client.service';

@Controller('orders')
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
