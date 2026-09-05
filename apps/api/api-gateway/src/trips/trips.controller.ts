import { Controller, Get, Param, Query } from '@nestjs/common';
import { TripsProxyService } from './trips.proxy.service';

@Controller('trips')
export class TripsController {
  constructor(private readonly tripsProxy: TripsProxyService) {}

  @Get('search')
  search(
    @Query('origin') origin?: string,
    @Query('destination') destination?: string,
    @Query('date') date?: string,
  ) {
    return this.tripsProxy.search({ origin, destination, date });
  }

  @Get(':tripId/seats')
  getSeats(@Param('tripId') tripId: string) {
    return this.tripsProxy.getSeats(tripId);
  }
}
