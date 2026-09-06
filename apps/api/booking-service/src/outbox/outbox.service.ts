import { Injectable } from '@nestjs/common';
import { Prisma } from '@bus/booking-prisma';
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

  /** Grava evento na mesma transação do estado de domínio. */
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

  /** Fora de tx (ex.: após hold Redis). Ainda passa pelo relay. */
  async enqueueStandalone(routingKey: string, payload: object) {
    const id = randomUUID();
    await this.prisma.outboxEvent.create({
      data: {
        id,
        routingKey,
        payload: payload as Prisma.InputJsonValue,
      },
    });
    this.log.info('outbox_enqueued', { id, routingKey });
    this.relay.kick();
  }

  /** Chamar após commit da tx que enfileirou. */
  kickRelay() {
    this.relay.kick();
  }
}
