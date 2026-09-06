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
import { RabbitMqService } from '@repo/messaging';
import { createLogger } from '@repo/observability';
import { MailService } from '../mail/mail.service';
import {
  paymentApprovedMail,
  paymentFailedMail,
  resolveRecipient,
  seatConfirmedMail,
  seatExpiredMail,
  seatReservedMail,
} from './notifications.mappers';

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

  private to(email?: string, userId?: string) {
    return resolveRecipient({ email, userId, defaultTo: this.defaultTo });
  }

  private async onSeatReserved(event: SeatReservedEvent) {
    await this.mail.send(
      seatReservedMail(event, this.to(undefined, event.userId)),
    );
  }

  private async onSeatConfirmed(event: SeatConfirmedEvent) {
    await this.mail.send(
      seatConfirmedMail(event, this.to(event.passengerEmail)),
    );
  }

  private async onSeatReleased(event: SeatReleasedEvent) {
    if (event.reason !== 'EXPIRED') {
      return;
    }
    await this.mail.send(seatExpiredMail(event, this.defaultTo));
  }

  private async onPaymentApproved(event: PaymentApprovedEvent) {
    if (event.passengerEmail) {
      return;
    }
    await this.mail.send(paymentApprovedMail(event, this.defaultTo));
  }

  private async onPaymentFailed(event: PaymentFailedEvent) {
    await this.mail.send(paymentFailedMail(event, this.defaultTo));
  }
}
