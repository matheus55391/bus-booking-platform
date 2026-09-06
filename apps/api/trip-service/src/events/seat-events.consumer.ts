import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  RoutingKeys,
  SeatConfirmedEvent,
  SeatReleasedEvent,
  SeatReservedEvent,
} from '@repo/events';
import { createCounter } from '@repo/observability';
import { RabbitMqService } from '@repo/messaging';
import { TripsService } from '../trips/trips.service';

const seatEvents = createCounter(
  'trip_seat_events_total',
  'Seat inventory events applied (Trip = sole writer)',
  ['type'],
);

/**
 * Confirm/release via eventos.
 * Hold síncrono: RPC `trip.hold-seat` (este handler só registra reserved).
 */
@Injectable()
export class SeatEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(SeatEventsConsumer.name);

  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly trips: TripsService,
  ) {}

  async onModuleInit() {
    await this.rabbit.subscribe(
      'trip_domain',
      [
        RoutingKeys.SeatReserved,
        RoutingKeys.SeatConfirmed,
        RoutingKeys.SeatReleased,
      ],
      async (payload, routingKey) => {
        if (routingKey === RoutingKeys.SeatReserved) {
          await this.onReserved(payload as SeatReservedEvent);
        } else if (routingKey === RoutingKeys.SeatConfirmed) {
          await this.onConfirmed(payload as SeatConfirmedEvent);
        } else if (routingKey === RoutingKeys.SeatReleased) {
          await this.onReleased(payload as SeatReleasedEvent);
        }
      },
    );
  }

  private async onReserved(event: SeatReservedEvent) {
    seatEvents.inc({ type: 'reserved' });
    this.logger.log(
      `SeatReserved ack seat=${event.seatLabel} trip=${event.tripId}`,
    );
  }

  private async onConfirmed(event: SeatConfirmedEvent) {
    await this.trips.confirmSeat({
      tripId: event.tripId,
      seatId: event.seatId,
    });
    seatEvents.inc({ type: 'confirmed' });
    this.logger.log(`SeatConfirmed seatId=${event.seatId}`);
  }

  private async onReleased(event: SeatReleasedEvent) {
    await this.trips.releaseSeat({
      tripId: event.tripId,
      seatId: event.seatId,
    });
    seatEvents.inc({ type: 'released' });
    this.logger.log(
      `SeatReleased seatId=${event.seatId} reason=${event.reason}`,
    );
  }
}
