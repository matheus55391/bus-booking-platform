import { Global, Module } from '@nestjs/common';
import { HoldStoreService } from './hold-store.service';

@Global()
@Module({
  providers: [HoldStoreService],
  exports: [HoldStoreService],
})
export class RedisModule {}
