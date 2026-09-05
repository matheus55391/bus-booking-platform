import { Controller, Get, Param, Query } from '@nestjs/common';
import { TripsService } from './trips.service';

@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Get('search')
  search(
    @Query('origin') origin?: string,
    @Query('destination') destination?: string,
    @Query('date') date?: string,
  ) {
    return this.tripsService.search({ origin, destination, date });
  }

  @Get(':tripId/seats')
  getSeats(@Param('tripId') tripId: string) {
    return this.tripsService.getSeats(tripId);
  }
}
