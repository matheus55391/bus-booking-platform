import {
  Inject,
  Injectable,
  NotFoundException,
  RequestTimeoutException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AppService,
  BookingTopics,
  ReservationStatus,
  type CreatePaymentInput,
  type Reservation,
} from '@repo/common';
import { createLogger } from '@repo/observability';
import { firstValueFrom, TimeoutError, timeout } from 'rxjs';
import { errorMessage } from './payments.validators';

/** RPC ao Booking — beginPayment + compensate-checkout da saga. */
@Injectable()
export class BookingClient {
  private readonly log = createLogger('booking-client');

  constructor(
    @Inject(AppService.Booking) private readonly bookingClient: ClientProxy,
  ) {}

  async beginPayment(
    input: CreatePaymentInput,
    reservationId: string,
  ): Promise<Reservation> {
    try {
      const reservation = await firstValueFrom(
        this.bookingClient
          .send<Reservation>(BookingTopics.BeginPayment, {
            reservationId,
            passenger: input.passenger,
            paymentMethod: input.paymentMethod,
          })
          .pipe(timeout(10_000)),
      );

      if (
        reservation.status !== ReservationStatus.PendingPayment &&
        reservation.status !== ReservationStatus.Confirmed
      ) {
        throw new Error(
          `reservation is ${reservation.status}, expected ${ReservationStatus.PendingPayment}`,
        );
      }
      if (new Date(reservation.expiresAt).getTime() < Date.now()) {
        throw new Error('reservation already expired');
      }
      return reservation;
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw new RequestTimeoutException('booking-service timeout');
      }
      if (error instanceof RequestTimeoutException) throw error;
      throw new NotFoundException(`reservation ${reservationId} not found`);
    }
  }

  async compensateCheckout(
    reservationId: string,
    reason: string,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.bookingClient
          .send(BookingTopics.CompensateCheckout, {
            reservationId,
            reason,
          })
          .pipe(timeout(10_000)),
      );
    } catch (error) {
      this.log.error('booking_compensate_failed', {
        reservationId,
        reason,
        error: errorMessage(error),
      });
      throw error;
    }
  }
}
