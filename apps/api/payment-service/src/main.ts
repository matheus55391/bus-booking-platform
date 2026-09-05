import { NestFactory } from '@nestjs/core';
import { createLogger, startTelemetry } from '@repo/observability';
import { AppModule } from './app.module';

async function bootstrap() {
  await startTelemetry('payment-service');
  const log = createLogger('payment-service');
  const app = await NestFactory.create(AppModule, { logger: false });
  const port = Number(process.env.PAYMENT_SERVICE_PORT ?? 3004);
  await app.listen(port);
  log.info('listening', { port });
}
bootstrap();
