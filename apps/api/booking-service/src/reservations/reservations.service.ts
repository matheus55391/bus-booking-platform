import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, ReservationStatus } from '@bus/booking-prisma';
import type {
  BeginPaymentInput,
  CompensateCheckoutInput,
  CreateReservationInput,
  LookupReservationInput,
} from '@repo/common';
import {
  PaymentApprovedEvent,
  PaymentFailedEvent,
  RoutingKeys,
} from '@repo/events';
import { RabbitMqService } from '@repo/messaging';
import { createLogger } from '@repo/observability';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { HoldStoreService } from '../redis/hold-store.service';
import { OutboxService } from '../outbox/outbox.service';
import {
  holdsConfirmed,
  holdsCreated,
  holdsExpired,
} from './reservations.metrics';
import {
  toDbResponse,
  toHoldResponse,
  toSeatConfirmedEvent,
  toSeatReleasedEvent,
  toSeatReservedEvent,
} from './reservations.mappers';
import {
  buildSeatHold,
  holdRoute,
  PAYMENT_HOLD_TTL_SECONDS,
  type SeatHold,
} from './reservations.types';
import {
  digitsOnly,
  generateOrderCode,
  normalizePassenger,
  parsePaymentMethod,
} from './reservations.validators';
import { TripInventoryClient } from './trip-inventory.client';

@Injectable()
export class ReservationsService implements OnModuleInit {
  private readonly log = createLogger('reservations');

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitMqService,
    private readonly holds: HoldStoreService,
    private readonly outbox: OutboxService,
    private readonly tripInventory: TripInventoryClient,
  ) {}

  async onModuleInit() {
    await this.rabbit.subscribe(
      'booking_domain',
      [RoutingKeys.PaymentApproved, RoutingKeys.PaymentFailed],
      async (payload, routingKey) => {
        if (routingKey === RoutingKeys.PaymentApproved) {
          await this.onPaymentApproved(payload as PaymentApprovedEvent);
          return;
        }
        if (routingKey === RoutingKeys.PaymentFailed) {
          await this.onPaymentFailed(payload as PaymentFailedEvent);
        }
      },
    );
  }

  /**
   * Hold Redis + RPC trip.hold-seat + outbox seat.reserved.
   * Não grava Reservation no Postgres.
   */
  async create(input: CreateReservationInput) {
    const tripId = input.tripId?.trim();
    const seatId = input.seatId?.trim();
    const userId = (input.userId?.trim() || 'guest').slice(0, 120);
    const idempotencyKey = input.idempotencyKey?.trim();

    if (!tripId || !seatId) {
      throw new BadRequestException('tripId and seatId are required');
    }
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key is required');
    }

    const existingHold = await this.holds.getByIdempotencyKey(idempotencyKey);
    if (existingHold) {
      holdsCreated.inc({
        result: 'idempotent',
        ...holdRoute(existingHold),
      });
      return this.holdResponse(existingHold, true);
    }

    const existingPaid = await this.prisma.reservation.findUnique({
      where: { idempotencyKey },
      include: { passenger: true },
    });
    if (existingPaid) {
      holdsCreated.inc({
        result: 'idempotent',
        origin: 'unknown',
        destination: 'unknown',
      });
      const label = await this.tripInventory.fetchSeatLabel(
        existingPaid.tripId,
        existingPaid.seatId,
      );
      return this.dbResponse(existingPaid, label, true);
    }

    const expiresAt = new Date(Date.now() + this.holds.ttlSeconds * 1000);
    const holdId = randomUUID();

    try {
      const inventory = await this.tripInventory.holdSeat(tripId, seatId);
      const hold = buildSeatHold({
        holdId,
        userId,
        idempotencyKey,
        expiresAt,
        inventory,
      });

      const created = await this.holds.tryCreate(hold);
      if (created.status === 'idempotent') {
        if (created.hold.seatId !== seatId) {
          await this.tripInventory.releaseSeat(tripId, seatId);
        }
        holdsCreated.inc({
          result: 'idempotent',
          ...holdRoute(created.hold),
        });
        return this.holdResponse(created.hold, true);
      }
      if (created.status === 'seat_taken') {
        await this.tripInventory.releaseSeat(tripId, seatId);
        throw new ConflictException(
          'Seat is not available for this trip (already held or sold)',
        );
      }

      const event = toSeatReservedEvent(created.hold);
      await this.outbox.enqueueStandalone(RoutingKeys.SeatReserved, event);

      holdsCreated.inc({
        result: 'created',
        origin: inventory.origin,
        destination: inventory.destination,
      });
      this.log.info('hold_created', {
        holdId: created.hold.id,
        tripId,
        seatId,
        seatLabel: inventory.seatLabel,
        userId,
        origin: inventory.origin,
        destination: inventory.destination,
        amountCents: created.hold.amountCents,
        expiresAt: created.hold.expiresAt,
      });

      return this.holdResponse(created.hold, false);
    } catch (error) {
      holdsCreated.inc({
        result: 'error',
        origin: 'unknown',
        destination: 'unknown',
      });
      throw error;
    }
  }

  async findById(id: string) {
    const hold = await this.holds.getById(id);
    if (hold) {
      const pending = await this.prisma.reservation.findUnique({
        where: { id },
        include: { passenger: true },
      });
      if (pending?.status === ReservationStatus.PENDING_PAYMENT) {
        return this.dbResponse(pending, hold.seatLabel, false);
      }
      return this.holdResponse(hold, false);
    }

    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: { passenger: true },
    });
    if (!reservation) {
      throw new NotFoundException(`reservation ${id} not found`);
    }

    const seatLabel = await this.tripInventory.fetchSeatLabel(
      reservation.tripId,
      reservation.seatId,
    );
    return this.dbResponse(reservation, seatLabel, false);
  }

  /** Primeira gravação no Postgres: pagamento iniciado. */
  async beginPayment(input: BeginPaymentInput) {
    const id = input.reservationId?.trim();
    if (!id) {
      throw new BadRequestException('reservationId is required');
    }

    const passengerData = normalizePassenger(input.passenger);
    const paymentMethod = parsePaymentMethod(input.paymentMethod);

    const existing = await this.prisma.reservation.findUnique({
      where: { id },
      include: { passenger: true },
    });
    if (existing?.status === ReservationStatus.CONFIRMED) {
      return this.dbResponse(existing, null, true);
    }
    if (existing?.status === ReservationStatus.PENDING_PAYMENT) {
      const hold = await this.holds.getById(id);
      if (hold) {
        await this.holds.refresh(hold, PAYMENT_HOLD_TTL_SECONDS);
      }
      return this.dbResponse(existing, hold?.seatLabel ?? null, true);
    }

    const hold = await this.holds.getById(id);
    if (!hold) {
      throw new NotFoundException(`hold ${id} not found or expired`);
    }
    if (new Date(hold.expiresAt).getTime() < Date.now()) {
      throw new BadRequestException('reservation already expired');
    }

    const refreshed = await this.holds.refresh(hold, PAYMENT_HOLD_TTL_SECONDS);

    for (let attempt = 0; attempt < 5; attempt++) {
      const orderCode = generateOrderCode();
      try {
        const created = await this.prisma.reservation.create({
          data: {
            id: refreshed.id,
            tripId: refreshed.tripId,
            seatId: refreshed.seatId,
            userId: passengerData.email,
            amountCents: refreshed.amountCents,
            status: ReservationStatus.PENDING_PAYMENT,
            expiresAt: new Date(refreshed.expiresAt),
            idempotencyKey: refreshed.idempotencyKey,
            orderCode,
            paymentMethod,
            passenger: {
              create: {
                name: passengerData.name,
                email: passengerData.email,
                document: passengerData.document,
                phone: passengerData.phone,
                birthDate: passengerData.birthDate,
              },
            },
          },
          include: { passenger: true },
        });

        this.log.info('payment_started', {
          holdId: created.id,
          orderCode: created.orderCode,
          tripId: created.tripId,
          seatId: created.seatId,
          passengerId: created.passengerId,
          passengerEmail: created.passenger.email,
          paymentMethod: created.paymentMethod,
          ...holdRoute(refreshed),
          amountCents: created.amountCents,
        });

        return this.dbResponse(created, refreshed.seatLabel, false);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const again = await this.prisma.reservation.findUnique({
            where: { id },
            include: { passenger: true },
          });
          if (again) {
            return this.dbResponse(again, refreshed.seatLabel, true);
          }
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException('could not allocate orderCode');
  }

  async lookup(input: LookupReservationInput) {
    const orderCode = input.orderCode?.trim().toUpperCase();
    const email = input.email?.trim().toLowerCase();
    const document = input.document ? digitsOnly(input.document) : '';

    if (!orderCode) {
      throw new BadRequestException('orderCode is required');
    }
    if (!email && !document) {
      throw new BadRequestException('email or document is required');
    }

    const reservation = await this.prisma.reservation.findUnique({
      where: { orderCode },
      include: { passenger: true },
    });

    if (!reservation) {
      throw new NotFoundException('order not found');
    }

    const emailOk = email
      ? reservation.passenger.email.toLowerCase() === email
      : false;
    const documentOk = document
      ? reservation.passenger.document === document
      : false;

    if (!emailOk && !documentOk) {
      throw new NotFoundException('order not found');
    }

    const seatLabel = await this.tripInventory.fetchSeatLabel(
      reservation.tripId,
      reservation.seatId,
    );
    return this.dbResponse(reservation, seatLabel, false);
  }

  async onPaymentApproved(event: PaymentApprovedEvent) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: event.reservationId },
      include: { passenger: true },
    });

    if (reservation?.status === ReservationStatus.CONFIRMED) {
      return;
    }

    const hold = await this.holds.getById(event.reservationId);

    if (!reservation && !hold) {
      this.log.warn('payment_for_unknown_hold', {
        reservationId: event.reservationId,
        paymentId: event.paymentId,
      });
      return;
    }

    const tripId = reservation?.tripId ?? hold!.tripId;
    const seatId = reservation?.seatId ?? hold!.seatId;

    if (!reservation) {
      this.log.warn('payment_approved_without_reservation', {
        reservationId: event.reservationId,
        paymentId: event.paymentId,
      });
      if (hold) await this.holds.delete(hold);
      return;
    }

    try {
      let didConfirm = false;
      const confirmed = toSeatConfirmedEvent({
        reservationId: event.reservationId,
        tripId,
        seatId,
        seatLabel: hold?.seatLabel,
        reservation,
      });

      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.reservation.updateMany({
          where: {
            id: event.reservationId,
            status: ReservationStatus.PENDING_PAYMENT,
          },
          data: { status: ReservationStatus.CONFIRMED },
        });
        if (updated.count === 0) {
          return;
        }
        didConfirm = true;

        await this.outbox.enqueue(
          tx,
          RoutingKeys.SeatConfirmed,
          confirmed,
          confirmed.eventId,
        );
      });

      if (!didConfirm) {
        if (hold) await this.holds.delete(hold);
        return;
      }

      this.outbox.kickRelay();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        if (hold) await this.holds.delete(hold);
        return;
      }
      throw error;
    }

    if (hold) {
      await this.holds.delete(hold);
    }

    const route = hold
      ? holdRoute(hold)
      : { origin: 'unknown', destination: 'unknown' };
    holdsConfirmed.inc(route);
    this.log.info('hold_confirmed', {
      holdId: event.reservationId,
      orderCode: reservation.orderCode,
      tripId,
      seatId,
      seatLabel: hold?.seatLabel,
      passengerId: reservation.passengerId,
      passengerEmail: reservation.passenger.email,
      userId: reservation.userId,
      ...route,
      amountCents: reservation.amountCents,
      paymentId: event.paymentId,
    });
  }

  async onPaymentFailed(event: PaymentFailedEvent) {
    await this.compensateCheckout({
      reservationId: event.reservationId,
      reason: event.reason,
    });
    this.log.warn('payment_failed_released', {
      reservationId: event.reservationId,
      paymentId: event.paymentId,
      reason: event.reason,
    });
  }

  async compensateCheckout(input: CompensateCheckoutInput) {
    const id = input.reservationId?.trim();
    if (!id) {
      throw new BadRequestException('reservationId is required');
    }

    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: { passenger: true },
    });

    if (reservation?.status === ReservationStatus.CONFIRMED) {
      this.log.warn('compensate_skipped_confirmed', {
        reservationId: id,
        reason: input.reason,
      });
      return { ok: true, skipped: true, status: reservation.status };
    }

    if (reservation?.status === ReservationStatus.PENDING_PAYMENT) {
      await this.prisma.reservation.update({
        where: { id },
        data: { status: ReservationStatus.CANCELLED },
      });
    }

    const hold = await this.holds.getById(id);
    if (hold) {
      await this.releaseHold(hold, 'CANCELLED');
    } else if (
      reservation &&
      (reservation.status === ReservationStatus.PENDING_PAYMENT ||
        reservation.status === ReservationStatus.CANCELLED)
    ) {
      await this.tripInventory.releaseSeat(
        reservation.tripId,
        reservation.seatId,
      );
    }

    this.log.warn('checkout_compensated', {
      reservationId: id,
      reason: input.reason,
      hadHold: Boolean(hold),
      previousStatus: reservation?.status,
    });

    return {
      ok: true,
      skipped: false,
      status: reservation?.status ?? 'NO_RESERVATION',
    };
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async expireHolds() {
    try {
      const dueIds = await this.holds.listDueIds();
      if (dueIds.length === 0) return;

      let released = 0;
      for (const id of dueIds) {
        const hold = await this.holds.getById(id);
        if (!hold) {
          await this.holds.removeDueId(id);
          continue;
        }

        const pending = await this.prisma.reservation.findUnique({
          where: { id },
        });
        if (pending?.status === ReservationStatus.PENDING_PAYMENT) {
          if (new Date(hold.expiresAt).getTime() > Date.now()) {
            continue;
          }
          await this.prisma.reservation.update({
            where: { id },
            data: { status: ReservationStatus.EXPIRED },
          });
        }

        await this.releaseHold(hold, 'EXPIRED');
        released += 1;
      }

      if (released > 0) {
        this.log.info('holds_expired_batch', { released });
      }
    } catch (error) {
      this.log.error('Failed to expire holds', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Healing: PENDING_PAYMENT expirado sem Redis → libera inventário via Trip RPC. */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async healOrphans() {
    try {
      const expiredPending = await this.prisma.reservation.findMany({
        where: {
          status: ReservationStatus.PENDING_PAYMENT,
          expiresAt: { lt: new Date() },
        },
        take: 50,
      });

      for (const reservation of expiredPending) {
        const hold = await this.holds.getById(reservation.id);
        if (hold) continue;

        await this.prisma.reservation.update({
          where: { id: reservation.id },
          data: { status: ReservationStatus.EXPIRED },
        });
        await this.tripInventory.releaseSeat(
          reservation.tripId,
          reservation.seatId,
        );
        this.log.warn('healed_expired_pending_without_hold', {
          reservationId: reservation.id,
          seatId: reservation.seatId,
        });
      }
    } catch (error) {
      this.log.error('heal_orphans_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async releaseHold(hold: SeatHold, reason: 'EXPIRED' | 'CANCELLED') {
    await this.holds.delete(hold);

    const released = toSeatReleasedEvent(hold, reason);
    await this.outbox.enqueueStandalone(RoutingKeys.SeatReleased, released);

    const route = holdRoute(hold);
    holdsExpired.inc({ ...route, reason });
    this.log.info('hold_released', {
      holdId: hold.id,
      tripId: hold.tripId,
      seatId: hold.seatId,
      seatLabel: hold.seatLabel,
      userId: hold.userId,
      ...route,
      reason,
    });
  }

  private holdResponse(hold: SeatHold, idempotentReplay: boolean) {
    return toHoldResponse(hold, this.holds.holdMinutes, idempotentReplay);
  }

  private dbResponse(
    reservation: Parameters<typeof toDbResponse>[0],
    seatLabel: string | null,
    idempotentReplay: boolean,
  ) {
    return toDbResponse(
      reservation,
      seatLabel,
      this.holds.holdMinutes,
      idempotentReplay,
    );
  }
}
