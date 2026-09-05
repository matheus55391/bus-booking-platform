import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ServiceQueues } from '@repo/common';
import { createLogger, startTelemetry } from '@repo/observability';
import { AppModule } from './app.module';

async function bootstrap() {
  await startTelemetry('booking-service');
  const log = createLogger('booking-service');
  const app = await NestFactory.create(AppModule, { logger: false });

  const rabbitUrl =
    process.env.RABBITMQ_URL ?? 'amqp://bus:bus@localhost:5672';
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitUrl],
      queue: ServiceQueues.Booking,
      queueOptions: { durable: true },
    },
  });

  await app.startAllMicroservices();
  const port = Number(process.env.BOOKING_SERVICE_PORT ?? 3003);
  await app.listen(port);
  log.info('listening', { port, queue: ServiceQueues.Booking });
}
bootstrap();
