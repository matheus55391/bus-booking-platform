import { Module } from '@nestjs/common';
import { TripsModule } from '../trips/trips.module';
import { SeatEventsConsumer } from './seat-events.consumer';

@Module({
  imports: [TripsModule],
  providers: [SeatEventsConsumer],
})
export class EventsModule {}
