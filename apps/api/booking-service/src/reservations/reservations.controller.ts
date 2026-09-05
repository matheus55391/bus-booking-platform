import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { ReservationsService } from './reservations.service';

class CreateReservationDto {
  tripId!: string;
  seatId!: string;
  userId?: string;
}

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  create(
    @Body() body: CreateReservationDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.reservationsService.create({
      ...body,
      idempotencyKey: idempotencyKey ?? '',
    });
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.reservationsService.findById(id);
  }
}
