import { Module } from '@nestjs/common';
import { OutboxRelayService } from './outbox-relay.service';
import { OutboxService } from './outbox.service';

@Module({
  providers: [OutboxRelayService, OutboxService],
  exports: [OutboxService, OutboxRelayService],
})
export class OutboxModule {}
