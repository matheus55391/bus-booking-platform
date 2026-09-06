import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { TripTopics } from '@repo/common';
import type {
  HoldSeatInput,
  SearchTripsQuery,
  SeatMutationInput,
} from '@repo/common';
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

  @MessagePattern(TripTopics.GetSeat)
  getSeat(@Payload() data: SeatMutationInput) {
    return this.tripsService.getSeat(data);
  }

  @MessagePattern(TripTopics.HoldSeat)
  holdSeat(@Payload() data: HoldSeatInput) {
    return this.tripsService.holdSeat(data);
  }

  @MessagePattern(TripTopics.ConfirmSeat)
  confirmSeat(@Payload() data: SeatMutationInput) {
    return this.tripsService.confirmSeat(data);
  }

  @MessagePattern(TripTopics.ReleaseSeat)
  releaseSeat(@Payload() data: SeatMutationInput) {
    return this.tripsService.releaseSeat(data);
  }
}
