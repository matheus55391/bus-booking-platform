import { NestFactory } from '@nestjs/core';
import { createLogger, startTelemetry } from '@repo/observability';
import { AppModule } from './app/app.module';

async function bootstrap() {
  await startTelemetry('api-gateway');
  const log = createLogger('api-gateway');
  const app = await NestFactory.create(AppModule, { logger: false });
  app.enableCors({
    origin: [
      'http://localhost:3000',
      process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    ],
  });
  const port = Number(process.env.GATEWAY_PORT ?? 3001);
  await app.listen(port);
  log.info('listening', { port, transport: 'http→rmq' });
}
bootstrap();
