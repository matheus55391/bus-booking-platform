import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TripsController } from './trips.controller';
import { TripsProxyService } from './trips.proxy.service';

@Module({
  imports: [HttpModule],
  controllers: [TripsController],
  providers: [TripsProxyService],
})
export class TripsModule {}
