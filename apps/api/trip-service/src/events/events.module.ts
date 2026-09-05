import { Module } from '@nestjs/common';
import { SeatEventsConsumer } from './seat-events.consumer';

@Module({
  providers: [SeatEventsConsumer],
})
export class EventsModule {}
