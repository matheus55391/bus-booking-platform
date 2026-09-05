import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { EXCHANGE } from '@repo/events';
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
    await this.channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    this.log.info('connected to RabbitMQ', { exchange: EXCHANGE });
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
        });
        recordMessagingPublished(getServiceName(), routingKey);
        this.log.info('published message', { routingKey });
      },
    );
  }

  async subscribe(
    queue: string,
    routingKeys: string[],
    handler: MessageHandler,
  ) {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not ready');
    }

    const channel = this.channel;

    await channel.assertQueue(queue, { durable: true });
    for (const key of routingKeys) {
      await channel.bindQueue(queue, EXCHANGE, key);
    }

    await channel.consume(queue, (msg) => {
      void this.handleConsumedMessage(msg, queue, handler);
    });

    this.log.info('subscribed', { queue, routingKeys: routingKeys.join(',') });
  }

  private async handleConsumedMessage(
    msg: amqp.ConsumeMessage | null,
    queue: string,
    handler: MessageHandler,
  ) {
    if (!msg || !this.channel) {
      return;
    }

    const channel = this.channel;
    const headers = toTraceCarrier(msg.properties.headers);
    const routingKey = msg.fields.routingKey;

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
              this.log.error('failed processing message', {
                routingKey,
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
