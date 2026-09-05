import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { ReservationsProxyService } from './reservations.proxy.service';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsProxy: ReservationsProxyService) {}

  @Post()
  create(
    @Body() body: { tripId: string; seatId: string; userId?: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.reservationsProxy.create(body, idempotencyKey);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.reservationsProxy.findById(id);
  }
}
