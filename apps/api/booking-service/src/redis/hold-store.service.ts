import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { SeatHold } from '../reservations/reservations.types';

const KEY = {
  hold: (id: string) => `bus:hold:${id}`,
  seat: (tripId: string, seatId: string) => `bus:hold:seat:${tripId}:${seatId}`,
  idem: (key: string) => `bus:hold:idem:${key}`,
  expiring: 'bus:hold:expiring',
} as const;

export type TryCreateHoldResult =
  | { status: 'created'; hold: SeatHold }
  | { status: 'idempotent'; hold: SeatHold }
  | { status: 'seat_taken' };

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

  /** Retorna hold id se o assento ainda estiver sob NX no Redis. */
  async getHoldIdBySeat(
    tripId: string,
    seatId: string,
  ): Promise<string | null> {
    return this.redis.get(KEY.seat(tripId, seatId));
  }

  async getByIdempotencyKey(idempotencyKey: string): Promise<SeatHold | null> {
    const id = await this.redis.get(KEY.idem(idempotencyKey));
    if (!id) return null;
    return this.getById(id);
  }

  /**
   * Cria hold atômico: Idempotency-Key NX + assento NX + TTL.
   * - idempotent: mesma key já criou hold (replay seguro)
   * - seat_taken: outro hold no assento
   */
  async tryCreate(hold: SeatHold): Promise<TryCreateHoldResult> {
    const ttl = this.ttlSeconds;
    const expiresAtMs = new Date(hold.expiresAt).getTime();

    const idemOk = await this.redis.set(
      KEY.idem(hold.idempotencyKey),
      hold.id,
      'EX',
      ttl,
      'NX',
    );
    if (idemOk !== 'OK') {
      const existing = await this.getByIdempotencyKey(hold.idempotencyKey);
      if (existing) {
        return { status: 'idempotent', hold: existing };
      }
      return { status: 'seat_taken' };
    }

    const seatOk = await this.redis.set(
      KEY.seat(hold.tripId, hold.seatId),
      hold.id,
      'EX',
      ttl,
      'NX',
    );
    if (seatOk !== 'OK') {
      await this.redis.del(KEY.idem(hold.idempotencyKey));
      return { status: 'seat_taken' };
    }

    const pipeline = this.redis.pipeline();
    pipeline.set(KEY.hold(hold.id), JSON.stringify(hold), 'EX', ttl);
    pipeline.zadd(KEY.expiring, expiresAtMs, hold.id);
    await pipeline.exec();
    return { status: 'created', hold };
  }

  /**
   * Estende o hold durante o checkout (pagamento em andamento).
   * Evita o cron liberar o assento no meio do pagamento.
   */
  async refresh(hold: SeatHold, ttlSeconds: number): Promise<SeatHold> {
    const next: SeatHold = {
      ...hold,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    };
    const expiresAtMs = new Date(next.expiresAt).getTime();
    const pipeline = this.redis.pipeline();
    pipeline.set(KEY.hold(next.id), JSON.stringify(next), 'EX', ttlSeconds);
    pipeline.set(KEY.idem(next.idempotencyKey), next.id, 'EX', ttlSeconds);
    pipeline.set(KEY.seat(next.tripId, next.seatId), next.id, 'EX', ttlSeconds);
    pipeline.zadd(KEY.expiring, expiresAtMs, next.id);
    await pipeline.exec();
    return next;
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
