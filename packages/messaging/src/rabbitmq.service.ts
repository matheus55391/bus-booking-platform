import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import {
  DLX_EXCHANGE,
  DLX_EXCHANGE_TYPE,
  EXCHANGE,
  EXCHANGE_TYPE,
} from '@repo/events';
import {
  createLogger,
  getServiceName,
  injectTraceCarrier,
  recordMessagingConsumed,
  recordMessagingPublished,
  withExtractedContext,
  withSpan,
} from '@repo/observability';
import { randomUUID } from 'crypto';

type MessageHandler = (payload: unknown, routingKey: string) => Promise<void>;

const PREFETCH = 10;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toTraceCarrier(
  headers: amqp.MessagePropertyHeaders | undefined,
): Record<string, unknown> {
  if (!headers) {
    return {};
  }
  return { ...headers };
}

function dlqName(queue: string): string {
  return `${queue}.dlq`;
}

/**
 * Domínio via topic `bus.topic`: publish(routingKey) → filas bound à key.
 * Falha no consumer → nack(requeue=false) → DLX `bus.dlx` → `{queue}.dlq`.
 */
@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly log = createLogger('rabbitmq');
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>(
      'RABBITMQ_URL',
      'amqp://bus:bus@localhost:5672',
    );

    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createChannel();
    await this.channel.prefetch(PREFETCH);
    await this.channel.assertExchange(EXCHANGE, EXCHANGE_TYPE, {
      durable: true,
    });
    await this.channel.assertExchange(DLX_EXCHANGE, DLX_EXCHANGE_TYPE, {
      durable: true,
    });
    this.log.info('connected to RabbitMQ', {
      exchange: EXCHANGE,
      type: EXCHANGE_TYPE,
      dlx: DLX_EXCHANGE,
      prefetch: PREFETCH,
    });
  }

  async onModuleDestroy() {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  async publish(routingKey: string, payload: object) {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not ready');
    }

    const channel = this.channel;

    await withSpan(
      `publish ${routingKey}`,
      {
        'messaging.system': 'rabbitmq',
        'messaging.destination': EXCHANGE,
        'messaging.rabbitmq.routing_key': routingKey,
      },
      () => {
        const traceHeaders = injectTraceCarrier();
        const body = Buffer.from(JSON.stringify(payload));
        channel.publish(EXCHANGE, routingKey, body, {
          contentType: 'application/json',
          messageId: randomUUID(),
          persistent: true,
          headers: traceHeaders,
          type: routingKey,
        });
        recordMessagingPublished(getServiceName(), routingKey);
        this.log.info('published message', { routingKey });
      },
    );
  }

  /**
   * @param bindingKeys routing keys (ou patterns tipo `seat.*`) bound no topic
   * @param interestKeys filtro opcional no handler; default = bindingKeys exatos
   */
  async subscribe(
    queue: string,
    bindingKeys: string[],
    handler: MessageHandler,
    interestKeys?: string[],
  ) {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not ready');
    }

    const channel = this.channel;
    const interest = new Set(interestKeys ?? bindingKeys);
    const deadLetter = dlqName(queue);

    await channel.assertQueue(deadLetter, { durable: true });
    await channel.bindQueue(deadLetter, DLX_EXCHANGE, '');

    try {
      await channel.assertQueue(queue, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': DLX_EXCHANGE,
        },
      });
    } catch (error) {
      this.log.error('queue_assert_failed_recreate_needed', {
        queue,
        hint:
          'Delete old queues in RabbitMQ UI or: rabbitmqctl delete_queue ' +
          queue,
        error: errorMessage(error),
      });
      throw error;
    }

    for (const key of bindingKeys) {
      await channel.bindQueue(queue, EXCHANGE, key);
    }

    await channel.consume(queue, (msg) => {
      void this.handleConsumedMessage(msg, queue, interest, handler);
    });

    this.log.info('subscribed (topic+dlq)', {
      queue,
      dlq: deadLetter,
      bindings: bindingKeys.join(','),
      prefetch: PREFETCH,
    });
  }

  private async handleConsumedMessage(
    msg: amqp.ConsumeMessage | null,
    queue: string,
    interest: Set<string>,
    handler: MessageHandler,
  ) {
    if (!msg || !this.channel) {
      return;
    }

    const channel = this.channel;
    const headers = toTraceCarrier(msg.properties.headers);
    const routingKey =
      msg.fields.routingKey ||
      (typeof msg.properties.type === 'string' ? msg.properties.type : '');

    if (interest.size > 0 && routingKey && !interest.has(routingKey)) {
      channel.ack(msg);
      return;
    }

    try {
      await withExtractedContext(headers, async () => {
        await withSpan(
          `consume ${routingKey}`,
          {
            'messaging.system': 'rabbitmq',
            'messaging.destination': queue,
            'messaging.rabbitmq.routing_key': routingKey,
          },
          async () => {
            try {
              const payload: unknown = JSON.parse(msg.content.toString());
              await handler(payload, routingKey);
              recordMessagingConsumed(getServiceName(), routingKey, 'ok');
              channel.ack(msg);
            } catch (error) {
              recordMessagingConsumed(getServiceName(), routingKey, 'error');
              this.log.error('failed processing message → DLQ', {
                routingKey,
                queue,
                dlq: dlqName(queue),
                error: errorMessage(error),
              });
              channel.nack(msg, false, false);
              throw error;
            }
          },
        );
      });
    } catch (error) {
      this.log.error('consume pipeline failed', {
        routingKey,
        error: errorMessage(error),
      });
      try {
        channel.nack(msg, false, false);
      } catch {
        /* already nacked */
      }
    }
  }
}
