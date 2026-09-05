import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AppService, ServiceQueues } from '@repo/common';
import { ObservabilityModule } from '../observability/observability.module';
import { HealthController } from './controllers/health.controller';
import { PaymentsController } from './controllers/payments.controller';
import { ReservationsController } from './controllers/reservations.controller';
import { TripsController } from './controllers/trips.controller';
import { HealthService } from './services/health.service';
import { RmqClientService } from './services/rmq-client.service';

const rabbitUrl =
  process.env.RABBITMQ_URL ?? 'amqp://bus:bus@localhost:5672';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../../.env'],
    }),
    ObservabilityModule,
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
      {
        name: AppService.Booking,
        transport: Transport.RMQ,
        options: {
          urls: [rabbitUrl],
          queue: ServiceQueues.Booking,
          queueOptions: { durable: true },
        },
      },
      {
        name: AppService.Payment,
        transport: Transport.RMQ,
        options: {
          urls: [rabbitUrl],
          queue: ServiceQueues.Payment,
          queueOptions: { durable: true },
        },
      },
    ]),
  ],
  controllers: [
    HealthController,
    TripsController,
    ReservationsController,
    PaymentsController,
  ],
  providers: [HealthService, RmqClientService],
})
export class AppModule {}
