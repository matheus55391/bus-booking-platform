import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MessagingModule } from '@repo/messaging';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ObservabilityModule } from './observability/observability.module';
import { RedisModule } from './redis/redis.module';
import { ReservationsModule } from './reservations/reservations.module';
import { OutboxModule } from './outbox/outbox.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../../.env'],
    }),
    ScheduleModule.forRoot(),
    ObservabilityModule,
    PrismaModule,
    MessagingModule,
    OutboxModule,
    RedisModule,
    ReservationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
