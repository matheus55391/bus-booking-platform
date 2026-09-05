import { NestFactory } from '@nestjs/core';
import { createLogger, startTelemetry } from '@repo/observability';
import { AppModule } from './app.module';

async function bootstrap() {
  await startTelemetry('booking-service');
  const log = createLogger('booking-service');
  const app = await NestFactory.create(AppModule, { logger: false });
  const port = Number(process.env.BOOKING_SERVICE_PORT ?? 3003);
  await app.listen(port);
  log.info('listening', { port });
}
bootstrap();
