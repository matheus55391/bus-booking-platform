import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  RoutingKeys,
  SeatConfirmedEvent,
  SeatReleasedEvent,
  SeatReservedEvent,
} from '@repo/events';
import { createCounter } from '@repo/observability';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMqService } from '../messaging/rabbitmq.service';

const seatEvents = createCounter(
  'trip_seat_events_total',
  'Seat projection events applied',
  ['type'],
);

@Injectable()
export class SeatEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(SeatEventsConsumer.name);

  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly prisma: PrismaService,
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
    // Projeção: Booking já pode ter setado HELD; evento reforça consistência eventual
    await this.prisma.$executeRaw`
      UPDATE "Seat"
      SET status = 'HELD', "updatedAt" = NOW()
      WHERE id = ${event.seatId}
        AND "tripId" = ${event.tripId}
        AND status IN ('AVAILABLE', 'HELD')
    `;
    seatEvents.inc({ type: 'reserved' });
    this.logger.log(
      `SeatReserved projection seat=${event.seatLabel} trip=${event.tripId}`,
    );
  }

  private async onConfirmed(event: SeatConfirmedEvent) {
    await this.prisma.$executeRaw`
      UPDATE "Seat"
      SET status = 'SOLD', "updatedAt" = NOW()
      WHERE id = ${event.seatId}
        AND "tripId" = ${event.tripId}
    `;
    seatEvents.inc({ type: 'confirmed' });
    this.logger.log(`SeatConfirmed projection seatId=${event.seatId}`);
  }

  private async onReleased(event: SeatReleasedEvent) {
    await this.prisma.$executeRaw`
      UPDATE "Seat"
      SET status = 'AVAILABLE', "updatedAt" = NOW()
      WHERE id = ${event.seatId}
        AND "tripId" = ${event.tripId}
        AND status = 'HELD'
    `;
    seatEvents.inc({ type: 'released' });
    this.logger.log(
      `SeatReleased projection seatId=${event.seatId} reason=${event.reason}`,
    );
  }
}
