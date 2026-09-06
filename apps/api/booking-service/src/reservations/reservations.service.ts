import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  PaymentMethod,
  Prisma,
  ReservationStatus,
} from '@bus/booking-prisma';
import type {
  BeginPaymentInput,
  CompensateCheckoutInput,
  CreateReservationInput,
  LookupReservationInput,
  PassengerData,
} from '@repo/common';
import {
  PaymentApprovedEvent,
  PaymentFailedEvent,
  RoutingKeys,
  SeatConfirmedEvent,
  SeatReleasedEvent,
  SeatReservedEvent,
} from '@repo/events';
import { createLogger } from '@repo/observability';
import { randomInt, randomUUID } from 'crypto';
import { RabbitMqService } from '../messaging/rabbitmq.service';
import { PrismaService } from '../prisma/prisma.service';
import { HoldStoreService } from '../redis/hold-store.service';
import { OutboxService } from '../outbox/outbox.service';
import {
  holdsConfirmed,
  holdsCreated,
  holdsExpired,
} from './reservations.metrics';
import {
  holdRoute,
  LockedSeat,
  SeatHold,
  TripPrice,
} from './reservations.types';

/** Janela extra no Redis enquanto o pagamento roda. */
const PAYMENT_HOLD_TTL_SECONDS = 120;

const ORDER_CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function generateOrderCode(): string {
  let letters = '';
  for (let i = 0; i < 3; i++) {
    letters += ORDER_CODE_LETTERS[randomInt(ORDER_CODE_LETTERS.length)];
  }
  const nums = String(randomInt(1000, 10000));
  return `${letters}-${nums}`;
}

function normalizePassenger(raw: PassengerData): PassengerData {
  const name = raw.name?.trim() ?? '';
  const email = raw.email?.trim().toLowerCase() ?? '';
  const document = digitsOnly(raw.document ?? '');
  const phone = digitsOnly(raw.phone ?? '');
  const birthDate = raw.birthDate?.trim() ?? '';

  if (name.length < 3) {
    throw new BadRequestException('passenger.name is required');
  }
  if (!email.includes('@') || email.length < 5) {
    throw new BadRequestException('passenger.email is invalid');
  }
  if (document.length !== 11) {
    throw new BadRequestException('passenger.document must be a CPF (11 digits)');
  }
  if (phone.length < 10 || phone.length > 11) {
    throw new BadRequestException('passenger.phone is invalid');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new BadRequestException('passenger.birthDate must be YYYY-MM-DD');
  }

  return { name, email, document, phone, birthDate };
}

function parsePaymentMethod(value: string): PaymentMethod {
  if (value === 'PIX' || value === 'CREDIT_CARD') {
    return value;
  }
  throw new BadRequestException('paymentMethod must be PIX or CREDIT_CARD');
}

@Injectable()
export class ReservationsService implements OnModuleInit {
  private readonly log = createLogger('reservations');

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitMqService,
    private readonly holds: HoldStoreService,
    private readonly outbox: OutboxService,
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
   * Cria hold no Redis + marca assento HELD + publica seat.reserved.
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
      return this.toHoldResponse(existingHold, true);
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
      return this.toDbResponse(existingPaid, null, true);
    }

    const expiresAt = new Date(Date.now() + this.holds.ttlSeconds * 1000);
    const holdId = randomUUID();

    try {
      const trip = await this.prisma.$queryRaw<TripPrice[]>`
        SELECT "priceCents", origin, destination
        FROM "Trip"
        WHERE id = ${tripId}
        LIMIT 1
      `;
      if (trip.length === 0) {
        throw new NotFoundException(`trip ${tripId} not found`);
      }

      const origin = trip[0].origin;
      const destination = trip[0].destination;

      const locked = await this.prisma.$queryRaw<LockedSeat[]>`
        UPDATE "Seat"
        SET status = 'HELD', "updatedAt" = NOW()
        WHERE id = ${seatId}
          AND "tripId" = ${tripId}
          AND status = 'AVAILABLE'
        RETURNING id, label, status::text AS status
      `;

      if (locked.length === 0) {
        throw new ConflictException(
          'Seat is not available for this trip (already held or sold)',
        );
      }

      const seatLabel = locked[0].label;
      const hold: SeatHold = {
        id: holdId,
        tripId,
        seatId,
        seatLabel,
        userId,
        amountCents: trip[0].priceCents,
        idempotencyKey,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        origin,
        destination,
      };

      const created = await this.holds.tryCreate(hold);
      if (created.status === 'idempotent') {
        // Corrida: já gravamos HELD neste request, mas a key já existia — desfaz PG.
        if (created.hold.seatId !== seatId) {
          await this.prisma.$executeRaw`
            UPDATE "Seat"
            SET status = 'AVAILABLE', "updatedAt" = NOW()
            WHERE id = ${seatId}
              AND status = 'HELD'
          `;
        }
        holdsCreated.inc({
          result: 'idempotent',
          ...holdRoute(created.hold),
        });
        return this.toHoldResponse(created.hold, true);
      }
      if (created.status === 'seat_taken') {
        await this.prisma.$executeRaw`
          UPDATE "Seat"
          SET status = 'AVAILABLE', "updatedAt" = NOW()
          WHERE id = ${seatId}
            AND status = 'HELD'
        `;
        throw new ConflictException(
          'Seat is not available for this trip (already held or sold)',
        );
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE "Trip"
          SET "availableSeats" = GREATEST("availableSeats" - 1, 0),
              "updatedAt" = NOW()
          WHERE id = ${tripId}
        `;

        const event: SeatReservedEvent = {
          eventId: randomUUID(),
          type: RoutingKeys.SeatReserved,
          occurredAt: new Date().toISOString(),
          reservationId: created.hold.id,
          tripId: created.hold.tripId,
          seatId: created.hold.seatId,
          seatLabel: created.hold.seatLabel,
          userId: created.hold.userId,
          expiresAt: created.hold.expiresAt,
          amountCents: created.hold.amountCents,
        };
        await this.outbox.enqueue(tx, RoutingKeys.SeatReserved, event, event.eventId);
      });
      this.outbox.kickRelay();

      holdsCreated.inc({ result: 'created', origin, destination });
      this.log.info('hold_created', {
        holdId: created.hold.id,
        tripId,
        seatId,
        seatLabel,
        userId,
        origin,
        destination,
        amountCents: created.hold.amountCents,
        expiresAt: created.hold.expiresAt,
      });

      return this.toHoldResponse(created.hold, false);
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
        return this.toDbResponse(pending, hold.seatLabel, false);
      }
      return this.toHoldResponse(hold, false);
    }

    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: { passenger: true },
    });
    if (!reservation) {
      throw new NotFoundException(`reservation ${id} not found`);
    }

    const seats = await this.prisma.$queryRaw<{ label: string }[]>`
      SELECT label FROM "Seat" WHERE id = ${reservation.seatId} LIMIT 1
    `;

    return this.toDbResponse(reservation, seats[0]?.label ?? null, false);
  }

  /**
   * Primeira gravação no Postgres: pagamento foi iniciado.
   * Hold continua no Redis até CONFIRMED ou FAILED.
   * Cria Passenger + Reservation com método de pagamento.
   */
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
      return this.toDbResponse(existing, null, true);
    }
    if (existing?.status === ReservationStatus.PENDING_PAYMENT) {
      const hold = await this.holds.getById(id);
      if (hold) {
        await this.holds.refresh(hold, PAYMENT_HOLD_TTL_SECONDS);
      }
      return this.toDbResponse(existing, hold?.seatLabel ?? null, true);
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

        return this.toDbResponse(created, refreshed.seatLabel, false);
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
            return this.toDbResponse(again, refreshed.seatLabel, true);
          }
          // colisão de orderCode — tenta de novo
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException('could not allocate orderCode');
  }

  /** Consulta guest: orderCode + e-mail ou CPF do Passenger. */
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

    const seats = await this.prisma.$queryRaw<{ label: string }[]>`
      SELECT label FROM "Seat" WHERE id = ${reservation.seatId} LIMIT 1
    `;

    return this.toDbResponse(reservation, seats[0]?.label ?? null, false);
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

    const seatId = reservation?.seatId ?? hold!.seatId;
    const tripId = reservation?.tripId ?? hold!.tripId;

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
      const confirmed: SeatConfirmedEvent = {
        eventId: randomUUID(),
        type: RoutingKeys.SeatConfirmed,
        occurredAt: new Date().toISOString(),
        reservationId: event.reservationId,
        tripId,
        seatId,
        seatLabel: hold?.seatLabel,
        orderCode: reservation.orderCode,
        passengerName: reservation.passenger.name,
        passengerEmail: reservation.passenger.email,
        amountCents: reservation.amountCents,
      };

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

        await tx.$executeRaw`
          UPDATE "Seat"
          SET status = 'SOLD', "updatedAt" = NOW()
          WHERE id = ${seatId}
            AND status IN ('HELD', 'SOLD')
        `;

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

    const route = hold ? holdRoute(hold) : { origin: 'unknown', destination: 'unknown' };
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

  /**
   * Compensação da saga de checkout: cancela PENDING_PAYMENT e libera hold/assento.
   * Idempotente (CANCELLED / EXPIRED / sem hold = ok).
   */
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
      // Hold já sumiu: ainda tenta liberar assento HELD órfão
      await this.prisma.$executeRaw`
        UPDATE "Seat"
        SET status = 'AVAILABLE', "updatedAt" = NOW()
        WHERE id = ${reservation.seatId}
          AND status = 'HELD'
      `;
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

        // Checkout em andamento: não libera pelo TTL do hold inicial
        const pending = await this.prisma.reservation.findUnique({
          where: { id },
        });
        if (pending?.status === ReservationStatus.PENDING_PAYMENT) {
          if (new Date(hold.expiresAt).getTime() > Date.now()) {
            continue;
          }
          // Janela de pagamento também expirou
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

  /**
   * Healing: PENDING_PAYMENT expirado sem Redis, e Seat HELD órfão sem hold NX.
   */
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
        await this.prisma.$executeRaw`
          UPDATE "Seat"
          SET status = 'AVAILABLE', "updatedAt" = NOW()
          WHERE id = ${reservation.seatId}
            AND status = 'HELD'
        `;
        await this.prisma.$executeRaw`
          UPDATE "Trip"
          SET "availableSeats" = "availableSeats" + 1,
              "updatedAt" = NOW()
          WHERE id = ${reservation.tripId}
        `;
        this.log.warn('healed_expired_pending_without_hold', {
          reservationId: reservation.id,
          seatId: reservation.seatId,
        });
      }

      const heldSeats = await this.prisma.$queryRaw<
        { id: string; tripId: string }[]
      >`
        SELECT id, "tripId" FROM "Seat"
        WHERE status = 'HELD'
        LIMIT 100
      `;

      for (const seat of heldSeats) {
        const holdId = await this.holds.getHoldIdBySeat(seat.tripId, seat.id);
        if (holdId) continue;

        const activeCheckout = await this.prisma.reservation.findFirst({
          where: {
            seatId: seat.id,
            tripId: seat.tripId,
            status: ReservationStatus.PENDING_PAYMENT,
            expiresAt: { gt: new Date() },
          },
        });
        if (activeCheckout) continue;

        await this.prisma.$executeRaw`
          UPDATE "Seat"
          SET status = 'AVAILABLE', "updatedAt" = NOW()
          WHERE id = ${seat.id}
            AND status = 'HELD'
        `;
        await this.prisma.$executeRaw`
          UPDATE "Trip"
          SET "availableSeats" = "availableSeats" + 1,
              "updatedAt" = NOW()
          WHERE id = ${seat.tripId}
        `;
        this.log.warn('healed_orphan_held_seat', {
          seatId: seat.id,
          tripId: seat.tripId,
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

    const released: SeatReleasedEvent = {
      eventId: randomUUID(),
      type: RoutingKeys.SeatReleased,
      occurredAt: new Date().toISOString(),
      reservationId: hold.id,
      tripId: hold.tripId,
      seatId: hold.seatId,
      reason,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "Seat"
        SET status = 'AVAILABLE', "updatedAt" = NOW()
        WHERE id = ${hold.seatId}
          AND status = 'HELD'
      `;
      await tx.$executeRaw`
        UPDATE "Trip"
        SET "availableSeats" = "availableSeats" + 1,
            "updatedAt" = NOW()
        WHERE id = ${hold.tripId}
      `;
      await this.outbox.enqueue(
        tx,
        RoutingKeys.SeatReleased,
        released,
        released.eventId,
      );
    });
    this.outbox.kickRelay();

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

  private toHoldResponse(hold: SeatHold, idempotentReplay: boolean) {
    return {
      id: hold.id,
      tripId: hold.tripId,
      seatId: hold.seatId,
      seatLabel: hold.seatLabel,
      userId: hold.userId,
      amountCents: hold.amountCents,
      status: 'RESERVED' as const,
      expiresAt: hold.expiresAt,
      createdAt: hold.createdAt,
      holdMinutes: this.holds.holdMinutes,
      idempotencyKey: hold.idempotencyKey,
      idempotentReplay,
    };
  }

  private toDbResponse(
    reservation: {
      id: string;
      tripId: string;
      seatId: string;
      userId: string;
      amountCents: number;
      status: ReservationStatus;
      expiresAt: Date;
      createdAt?: Date;
      idempotencyKey: string;
      orderCode: string;
      paymentMethod: PaymentMethod;
      passenger: {
        id: string;
        name: string;
        email: string;
        document: string;
        phone: string;
        birthDate: string;
      };
    },
    seatLabel: string | null,
    idempotentReplay: boolean,
  ) {
    return {
      id: reservation.id,
      tripId: reservation.tripId,
      seatId: reservation.seatId,
      seatLabel,
      userId: reservation.userId,
      amountCents: reservation.amountCents,
      status: reservation.status,
      expiresAt: reservation.expiresAt.toISOString(),
      createdAt: reservation.createdAt?.toISOString(),
      holdMinutes: this.holds.holdMinutes,
      idempotencyKey: reservation.idempotencyKey,
      idempotentReplay,
      orderCode: reservation.orderCode,
      paymentMethod: reservation.paymentMethod,
      passenger: {
        id: reservation.passenger.id,
        name: reservation.passenger.name,
        email: reservation.passenger.email,
        document: reservation.passenger.document,
        phone: reservation.passenger.phone,
        birthDate: reservation.passenger.birthDate,
      },
    };
  }
}
