import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.TRIP_SERVICE_PORT ?? 3002);
  await app.listen(port);
  console.log(`trip-service listening on http://localhost:${port}`);
}
bootstrap();
