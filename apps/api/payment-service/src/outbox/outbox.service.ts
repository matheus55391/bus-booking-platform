import { Injectable } from '@nestjs/common';
import { Prisma } from '@bus/payment-prisma';
import { createLogger } from '@repo/observability';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxRelayService } from './outbox-relay.service';

type Tx = Prisma.TransactionClient;

@Injectable()
export class OutboxService {
  private readonly log = createLogger('outbox');

  constructor(
    private readonly prisma: PrismaService,
    private readonly relay: OutboxRelayService,
  ) {}

  async enqueue(tx: Tx, routingKey: string, payload: object, id?: string) {
    await tx.outboxEvent.create({
      data: {
        id: id ?? randomUUID(),
        routingKey,
        payload: payload as Prisma.InputJsonValue,
      },
    });
    this.log.info('outbox_enqueued', { id: id ?? '(generated)', routingKey });
  }

  kickRelay() {
    this.relay.kick();
  }
}
