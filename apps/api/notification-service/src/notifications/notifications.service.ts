import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceQueues } from '@repo/common';
import {
  RoutingKeys,
  type PaymentApprovedEvent,
  type PaymentFailedEvent,
  type SeatConfirmedEvent,
  type SeatReleasedEvent,
  type SeatReservedEvent,
} from '@repo/events';
import { createLogger } from '@repo/observability';
import { MailService } from '../mail/mail.service';
import { RabbitMqService } from '../messaging/rabbitmq.service';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly log = createLogger('notifications');
  private readonly defaultTo: string;

  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.defaultTo = config.get<string>(
      'NOTIFICATION_DEFAULT_TO',
      'passageiro@rodoviaria.local',
    );
  }

  async onModuleInit() {
    await this.rabbit.subscribe(
      ServiceQueues.Notification,
      [
        RoutingKeys.SeatReserved,
        RoutingKeys.SeatConfirmed,
        RoutingKeys.SeatReleased,
        RoutingKeys.PaymentApproved,
        RoutingKeys.PaymentFailed,
      ],
      async (payload, routingKey) => {
        await this.onEvent(payload, routingKey);
      },
    );
  }

  private async onEvent(payload: unknown, routingKey: string) {
    switch (routingKey) {
      case RoutingKeys.SeatReserved:
        await this.onSeatReserved(payload as SeatReservedEvent);
        return;
      case RoutingKeys.SeatConfirmed:
        await this.onSeatConfirmed(payload as SeatConfirmedEvent);
        return;
      case RoutingKeys.SeatReleased:
        await this.onSeatReleased(payload as SeatReleasedEvent);
        return;
      case RoutingKeys.PaymentApproved:
        await this.onPaymentApproved(payload as PaymentApprovedEvent);
        return;
      case RoutingKeys.PaymentFailed:
        await this.onPaymentFailed(payload as PaymentFailedEvent);
        return;
      default:
        this.log.warn('ignored_event', { routingKey });
    }
  }

  private resolveTo(userId?: string) {
    if (userId && userId.includes('@')) {
      return userId;
    }
    return this.defaultTo;
  }

  private async onSeatReserved(event: SeatReservedEvent) {
    const to = this.resolveTo(event.userId);
    const expires = new Date(event.expiresAt).toLocaleString('pt-BR');
    await this.mail.send({
      to,
      template: 'seat_reserved',
      subject: `Assento ${event.seatLabel} reservado — finalize o pagamento`,
      text: [
        'Olá!',
        '',
        `Seu assento ${event.seatLabel} foi reservado.`,
        `Reserva: ${event.reservationId}`,
        `Valor: R$ ${(event.amountCents / 100).toFixed(2)}`,
        `Expira em: ${expires}`,
        '',
        'Conclua o pagamento antes do vencimento para confirmar a passagem.',
        '',
        '— Rodoviária',
      ].join('\n'),
    });
  }

  private async onSeatConfirmed(event: SeatConfirmedEvent) {
    await this.mail.send({
      to: this.defaultTo,
      template: 'seat_confirmed',
      subject: 'Passagem confirmada',
      text: [
        'Pagamento confirmado!',
        '',
        `Reserva: ${event.reservationId}`,
        `Assento (id): ${event.seatId}`,
        `Viagem: ${event.tripId}`,
        '',
        'Boa viagem!',
        '',
        '— Rodoviária',
      ].join('\n'),
    });
  }

  private async onSeatReleased(event: SeatReleasedEvent) {
    if (event.reason !== 'EXPIRED') {
      return;
    }
    await this.mail.send({
      to: this.defaultTo,
      template: 'seat_expired',
      subject: 'Reserva expirada',
      text: [
        'Sua reserva temporária expirou e o assento foi liberado.',
        '',
        `Reserva: ${event.reservationId}`,
        `Motivo: ${event.reason}`,
        '',
        'Você pode escolher outro assento na busca.',
        '',
        '— Rodoviária',
      ].join('\n'),
    });
  }

  private async onPaymentApproved(event: PaymentApprovedEvent) {
    await this.mail.send({
      to: this.defaultTo,
      template: 'payment_approved',
      subject: `Pagamento aprovado · ${event.transactionId}`,
      text: [
        'Recebemos seu pagamento.',
        '',
        `Pagamento: ${event.paymentId}`,
        `Reserva: ${event.reservationId}`,
        `Valor: R$ ${(event.amountCents / 100).toFixed(2)}`,
        `Transação: ${event.transactionId}`,
        '',
        '— Rodoviária',
      ].join('\n'),
    });
  }

  private async onPaymentFailed(event: PaymentFailedEvent) {
    await this.mail.send({
      to: this.defaultTo,
      template: 'payment_failed',
      subject: 'Pagamento não aprovado',
      text: [
        'Não conseguimos concluir o pagamento.',
        '',
        `Pagamento: ${event.paymentId}`,
        `Reserva: ${event.reservationId}`,
        `Motivo: ${event.reason}`,
        '',
        'Tente novamente ou escolha outro assento.',
        '',
        '— Rodoviária',
      ].join('\n'),
    });
  }
}
