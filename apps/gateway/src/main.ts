import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: [
      'http://localhost:3000',
      process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    ],
  });
  const port = Number(process.env.GATEWAY_PORT ?? 3001);
  await app.listen(port);
  console.log(`gateway listening on http://localhost:${port}`);
}
bootstrap();
