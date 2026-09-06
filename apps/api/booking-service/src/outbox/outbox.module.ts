import { Global, Module } from '@nestjs/common';
import { OutboxRelayService } from './outbox-relay.service';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  providers: [OutboxRelayService, OutboxService],
  exports: [OutboxService, OutboxRelayService],
})
export class OutboxModule {}
