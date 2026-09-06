import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AppService, ServiceQueues } from '@repo/common';
import { OutboxModule } from '../outbox/outbox.module';
import { BookingClient } from './booking.client';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { CheckoutSagaService } from './checkout-saga.service';
import { PspWebhookService } from './psp-webhook.service';

const rabbitUrl = process.env.RABBITMQ_URL ?? 'amqp://bus:bus@localhost:5672';

@Module({
  imports: [
    OutboxModule,
    ClientsModule.register([
      {
        name: AppService.Booking,
        transport: Transport.RMQ,
        options: {
          urls: [rabbitUrl],
          queue: ServiceQueues.Booking,
          queueOptions: { durable: true },
        },
      },
    ]),
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    CheckoutSagaService,
    PspWebhookService,
    BookingClient,
  ],
})
export class PaymentsModule {}
