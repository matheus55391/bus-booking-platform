import { Controller, Get, Param, Query } from '@nestjs/common';
import { AppService, TripTopics } from '@repo/common';
import { RmqClientService } from '../services/rmq-client.service';

@Controller('trips')
export class TripsController {
  constructor(private readonly rmq: RmqClientService) {}

  @Get('search')
  search(
    @Query('origin') origin?: string,
    @Query('destination') destination?: string,
    @Query('date') date?: string,
  ) {
    return this.rmq.send(AppService.Trip, TripTopics.Search, {
      origin,
      destination,
      date,
    });
  }

  @Get(':tripId/seats')
  getSeats(@Param('tripId') tripId: string) {
    return this.rmq.send(AppService.Trip, TripTopics.GetSeats, { tripId });
  }
}
