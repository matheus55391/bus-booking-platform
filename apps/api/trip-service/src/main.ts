import { NestFactory } from '@nestjs/core';
import { createLogger, startTelemetry } from '@repo/observability';
import { AppModule } from './app.module';

async function bootstrap() {
  await startTelemetry('trip-service');
  const log = createLogger('trip-service');
  const app = await NestFactory.create(AppModule, { logger: false });
  const port = Number(process.env.TRIP_SERVICE_PORT ?? 3002);
  await app.listen(port);
  log.info('listening', { port });
}
bootstrap();
