import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createLogger, startTelemetry } from '@repo/observability';
import { AppModule } from './app/app.module';

async function bootstrap() {
  await startTelemetry('api-gateway');
  const log = createLogger('api-gateway');
  const app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.enableCors({
    origin: [
      'http://localhost:3000',
      process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    ],
  });

  const swagger = new DocumentBuilder()
    .setTitle('Bus Booking Platform — API Gateway')
    .setDescription(
      [
        'BFF HTTP → RabbitMQ RPC (Trip / Booking / Payment).',
        '',
        '**Hold:** `POST /reservations` + header `Idempotency-Key` (sem row no PG).',
        '**Checkout:** `POST /payments` abre saga (beginPayment → charge → payment.*).',
        '**Pedido:** `GET /orders/lookup?orderCode&email|document`.',
        '',
        'OpenAPI Spec: `GET /docs-json`.',
      ].join('\n'),
    )
    .setVersion('0.1.0')
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'Idempotency-Key',
        description: 'Obrigatório em POST /reservations e POST /payments',
      },
      'Idempotency-Key',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    yamlDocumentUrl: 'docs-yaml',
  });

  const port = Number(process.env.GATEWAY_PORT ?? 3001);
  await app.listen(port);
  log.info('listening', {
    port,
    transport: 'http→rmq',
    swagger: `http://localhost:${port}/docs`,
  });
}

void bootstrap();
