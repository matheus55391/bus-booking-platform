import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { SeatHold } from '../reservations/reservations.types';

const KEY = {
  hold: (id: string) => `bus:hold:${id}`,
  seat: (tripId: string, seatId: string) => `bus:hold:seat:${tripId}:${seatId}`,
  idem: (key: string) => `bus:hold:idem:${key}`,
  expiring: 'bus:hold:expiring',
} as const;

@Injectable()
export class HoldStoreService implements OnModuleDestroy {
  private readonly redis: Redis;
  readonly ttlSeconds: number;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    this.ttlSeconds = Number(
      config.get<string>('RESERVATION_HOLD_TTL_SECONDS') ?? 60,
    );
    if (!Number.isFinite(this.ttlSeconds) || this.ttlSeconds <= 0) {
      throw new Error('RESERVATION_HOLD_TTL_SECONDS must be a positive number');
    }
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  get holdMinutes(): number {
    return Math.ceil(this.ttlSeconds / 60);
  }

  async getById(id: string): Promise<SeatHold | null> {
    const raw = await this.redis.get(KEY.hold(id));
    return raw ? (JSON.parse(raw) as SeatHold) : null;
  }

  async getByIdempotencyKey(idempotencyKey: string): Promise<SeatHold | null> {
    const id = await this.redis.get(KEY.idem(idempotencyKey));
    if (!id) return null;
    return this.getById(id);
  }

  /**
   * Cria hold atômico no assento (SET NX + TTL).
   * Retorna null se o assento já estiver sob hold.
   */
  async tryCreate(hold: SeatHold): Promise<SeatHold | null> {
    const ttl = this.ttlSeconds;
    const expiresAtMs = new Date(hold.expiresAt).getTime();

    const seatOk = await this.redis.set(
      KEY.seat(hold.tripId, hold.seatId),
      hold.id,
      'EX',
      ttl,
      'NX',
    );
    if (seatOk !== 'OK') {
      return null;
    }

    const pipeline = this.redis.pipeline();
    pipeline.set(KEY.hold(hold.id), JSON.stringify(hold), 'EX', ttl);
    pipeline.set(KEY.idem(hold.idempotencyKey), hold.id, 'EX', ttl);
    pipeline.zadd(KEY.expiring, expiresAtMs, hold.id);
    await pipeline.exec();
    return hold;
  }

  async delete(hold: SeatHold): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.del(KEY.hold(hold.id));
    pipeline.del(KEY.seat(hold.tripId, hold.seatId));
    pipeline.del(KEY.idem(hold.idempotencyKey));
    pipeline.zrem(KEY.expiring, hold.id);
    await pipeline.exec();
  }

  /** IDs cujo expiresAt já passou (para o cron liberar assento). */
  async listDueIds(nowMs = Date.now()): Promise<string[]> {
    return this.redis.zrangebyscore(KEY.expiring, 0, nowMs);
  }

  async removeDueId(id: string): Promise<void> {
    await this.redis.zrem(KEY.expiring, id);
  }
}
