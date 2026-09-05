import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { AppService, BookingTopics } from '@repo/common';
import { requireIdempotencyKey } from '../pipes/idempotency-key.pipe';
import { RmqClientService } from '../services/rmq-client.service';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly rmq: RmqClientService) {}

  @Post()
  create(
    @Body() body: { tripId: string; seatId: string; userId?: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.rmq.send(AppService.Booking, BookingTopics.CreateReservation, {
      ...body,
      idempotencyKey: requireIdempotencyKey(idempotencyKey),
    });
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.rmq.send(AppService.Booking, BookingTopics.GetReservation, {
      id,
    });
  }
}
