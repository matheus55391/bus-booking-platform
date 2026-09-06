import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ServiceQueues } from '@repo/common';
import { createLogger, startTelemetry } from '@repo/observability';
import { AppModule } from './app.module';

async function bootstrap() {
  await startTelemetry('trip-service');
  const log = createLogger('trip-service');
  const app = await NestFactory.create(AppModule, { logger: false });

  const rabbitUrl = process.env.RABBITMQ_URL ?? 'amqp://bus:bus@localhost:5672';
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitUrl],
      queue: ServiceQueues.Trip,
      queueOptions: { durable: true },
    },
  });

  await app.startAllMicroservices();
  const port = Number(process.env.TRIP_SERVICE_PORT ?? 3002);
  await app.listen(port);
  log.info('listening', { port, queue: ServiceQueues.Trip });
}

void bootstrap();
