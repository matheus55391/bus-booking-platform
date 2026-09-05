import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ReservationsController } from './reservations.controller';
import { ReservationsProxyService } from './reservations.proxy.service';

@Module({
  imports: [HttpModule],
  controllers: [ReservationsController],
  providers: [ReservationsProxyService],
})
export class ReservationsModule {}
