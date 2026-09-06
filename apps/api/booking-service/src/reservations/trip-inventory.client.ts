import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  RequestTimeoutException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AppService,
  TripTopics,
  type HoldSeatResult,
  type SeatLabelResult,
} from '@repo/common';
import { createLogger } from '@repo/observability';
import { firstValueFrom, TimeoutError, timeout } from 'rxjs';
import { rpcErrorMessage } from './reservations.validators';

/** RPC ao Trip — único writer de inventário de assentos. */
@Injectable()
export class TripInventoryClient {
  private readonly log = createLogger('trip-inventory-client');

  constructor(
    @Inject(AppService.Trip) private readonly tripClient: ClientProxy,
  ) {}

  async holdSeat(tripId: string, seatId: string): Promise<HoldSeatResult> {
    try {
      return await firstValueFrom(
        this.tripClient
          .send<HoldSeatResult>(TripTopics.HoldSeat, { tripId, seatId })
          .pipe(timeout(8_000)),
      );
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw new RequestTimeoutException('trip-service timeout on hold-seat');
      }
      const msg = rpcErrorMessage(error);
      if (/not available|Conflict|409/i.test(msg)) {
        throw new ConflictException(
          'Seat is not available for this trip (already held or sold)',
        );
      }
      if (/not found|404/i.test(msg)) {
        throw new NotFoundException(`trip ${tripId} not found`);
      }
      throw error;
    }
  }

  async releaseSeat(tripId: string, seatId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.tripClient
          .send(TripTopics.ReleaseSeat, { tripId, seatId })
          .pipe(timeout(8_000)),
      );
    } catch (error) {
      this.log.error('trip_release_seat_failed', {
        tripId,
        seatId,
        error: rpcErrorMessage(error),
      });
    }
  }

  async fetchSeatLabel(tripId: string, seatId: string): Promise<string | null> {
    try {
      const seat = await firstValueFrom(
        this.tripClient
          .send<SeatLabelResult>(TripTopics.GetSeat, { tripId, seatId })
          .pipe(timeout(5_000)),
      );
      return seat.seatLabel;
    } catch {
      return null;
    }
  }
}
