import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { TripTopics } from '@repo/common';
import type { SearchTripsQuery } from '@repo/common';
import { TripsService } from './trips.service';

@Controller()
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @MessagePattern(TripTopics.Search)
  search(@Payload() query: SearchTripsQuery) {
    return this.tripsService.search(query);
  }

  @MessagePattern(TripTopics.GetSeats)
  getSeats(@Payload() data: { tripId: string }) {
    return this.tripsService.getSeats(data.tripId);
  }
}
