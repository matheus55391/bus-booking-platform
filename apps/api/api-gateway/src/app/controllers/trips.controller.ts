import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService, TripTopics } from '@repo/common';
import { SearchTripsQueryDto } from '../dto/http.dto';
import { RmqClientService } from '../services/rmq-client.service';

@ApiTags('trips')
@Controller('trips')
export class TripsController {
  constructor(private readonly rmq: RmqClientService) {}

  @Get('search')
  @ApiOperation({ summary: 'Buscar viagens por origem, destino e data' })
  @ApiOkResponse({ description: 'Lista de viagens' })
  search(@Query() query: SearchTripsQueryDto) {
    return this.rmq.send(AppService.Trip, TripTopics.Search, {
      origin: query.origin,
      destination: query.destination,
      date: query.date,
    });
  }

  @Get(':tripId/seats')
  @ApiOperation({ summary: 'Mapa de assentos da viagem' })
  @ApiOkResponse({ description: 'Assentos AVAILABLE / HELD / SOLD' })
  getSeats(@Param('tripId') tripId: string) {
    return this.rmq.send(AppService.Trip, TripTopics.GetSeats, { tripId });
  }
}
