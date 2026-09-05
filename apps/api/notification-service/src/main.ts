import { NestFactory } from '@nestjs/core';
import { ServiceQueues } from '@repo/common';
import { createLogger, startTelemetry } from '@repo/observability';
import { AppModule } from './app.module';

async function bootstrap() {
  await startTelemetry('notification-service');
  const log = createLogger('notification-service');
  const app = await NestFactory.create(AppModule, { logger: false });

  const port = Number(process.env.NOTIFICATION_SERVICE_PORT ?? 3006);
  await app.listen(port);
  log.info('listening', {
    port,
    queue: ServiceQueues.Notification,
    mailhog: 'http://localhost:8025',
  });
}

void bootstrap();
