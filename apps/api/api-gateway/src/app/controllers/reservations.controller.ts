import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AppService, BookingTopics } from '@repo/common';
import { CreateReservationDto } from '../dto/http.dto';
import { requireIdempotencyKey } from '../pipes/idempotency-key.pipe';
import { RmqClientService } from '../services/rmq-client.service';

@ApiTags('reservations')
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly rmq: RmqClientService) {}

  @Post()
  @ApiOperation({
    summary: 'Hold de assento (Redis + Trip.hold-seat)',
    description:
      'Não grava Reservation no Postgres. Requer Idempotency-Key. TTL curto em dev.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Chave única por tentativa de hold (sticky no client)',
  })
  @ApiOkResponse({ description: 'Hold RESERVED com expiresAt' })
  create(
    @Body() body: CreateReservationDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.rmq.send(AppService.Booking, BookingTopics.CreateReservation, {
      ...body,
      idempotencyKey: requireIdempotencyKey(idempotencyKey),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar hold ou Reservation por id' })
  findById(@Param('id') id: string) {
    return this.rmq.send(AppService.Booking, BookingTopics.GetReservation, {
      id,
    });
  }
}
