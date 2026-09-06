import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AppService, ServiceQueues } from '@repo/common';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { TripInventoryClient } from './trip-inventory.client';

const rabbitUrl = process.env.RABBITMQ_URL ?? 'amqp://bus:bus@localhost:5672';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: AppService.Trip,
        transport: Transport.RMQ,
        options: {
          urls: [rabbitUrl],
          queue: ServiceQueues.Trip,
          queueOptions: { durable: true },
        },
      },
    ]),
  ],
  controllers: [ReservationsController],
  providers: [ReservationsService, TripInventoryClient],
})
export class ReservationsModule {}
