import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createLogger } from '@repo/observability';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMqService } from '../messaging/rabbitmq.service';

const MAX_ATTEMPTS = 5;

@Injectable()
export class OutboxRelayService {
  private readonly log = createLogger('outbox-relay');
  private flushing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitMqService,
  ) {}

  /** Dispara flush assíncrono (baixa latência após enqueue). */
  kick() {
    void this.flush();
  }

  @Cron(CronExpression.EVERY_SECOND)
  async onCron() {
    await this.flush();
  }

  async flush() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const batch = await this.prisma.outboxEvent.findMany({
        where: {
          publishedAt: null,
          poisonedAt: null,
        },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });

      for (const row of batch) {
        const payload =
          typeof row.payload === 'object' && row.payload !== null
            ? (row.payload as object)
            : {};
        try {
          await this.rabbit.publish(row.routingKey, payload);
          const marked = await this.prisma.outboxEvent.updateMany({
            where: { id: row.id, publishedAt: null },
            data: { publishedAt: new Date(), lastError: null },
          });
          if (marked.count > 0) {
            this.log.info('outbox_published', {
              id: row.id,
              routingKey: row.routingKey,
              attempts: row.attempts,
            });
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          const attempts = row.attempts + 1;
          if (attempts >= MAX_ATTEMPTS) {
            await this.prisma.outboxEvent.update({
              where: { id: row.id },
              data: {
                attempts,
                lastError: message.slice(0, 500),
                poisonedAt: new Date(),
              },
            });
            this.log.error('outbox_poisoned', {
              id: row.id,
              routingKey: row.routingKey,
              attempts,
              error: message,
            });
          } else {
            await this.prisma.outboxEvent.update({
              where: { id: row.id },
              data: {
                attempts,
                lastError: message.slice(0, 500),
              },
            });
            this.log.warn('outbox_publish_retry', {
              id: row.id,
              routingKey: row.routingKey,
              attempts,
              error: message,
            });
          }
        }
      }
    } catch (error) {
      this.log.error('outbox_flush_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.flushing = false;
    }
  }
}
