import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { BookingTopics } from '@repo/common';
import type {
  BeginPaymentInput,
  CompensateCheckoutInput,
  CreateReservationInput,
  LookupReservationInput,
} from '@repo/common';
import { ReservationsService } from './reservations.service';

@Controller()
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @MessagePattern(BookingTopics.CreateReservation)
  create(@Payload() input: CreateReservationInput) {
    return this.reservationsService.create(input);
  }

  @MessagePattern(BookingTopics.GetReservation)
  findById(@Payload() data: { id: string }) {
    return this.reservationsService.findById(data.id);
  }

  @MessagePattern(BookingTopics.BeginPayment)
  beginPayment(@Payload() input: BeginPaymentInput) {
    return this.reservationsService.beginPayment(input);
  }

  @MessagePattern(BookingTopics.CompensateCheckout)
  compensateCheckout(@Payload() input: CompensateCheckoutInput) {
    return this.reservationsService.compensateCheckout(input);
  }

  @MessagePattern(BookingTopics.LookupReservation)
  lookup(@Payload() input: LookupReservationInput) {
    return this.reservationsService.lookup(input);
  }
}
