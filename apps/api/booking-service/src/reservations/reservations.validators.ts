import { BadRequestException } from '@nestjs/common';
import { PaymentMethod as PrismaPaymentMethod } from '@bus/booking-prisma';
import { PaymentMethod, type PassengerData } from '@repo/common';
import { randomInt } from 'crypto';

const ORDER_CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function generateOrderCode(): string {
  let letters = '';
  for (let i = 0; i < 3; i++) {
    letters += ORDER_CODE_LETTERS[randomInt(ORDER_CODE_LETTERS.length)];
  }
  const nums = String(randomInt(1000, 10000));
  return `${letters}-${nums}`;
}

export function normalizePassenger(raw: PassengerData): PassengerData {
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
    throw new BadRequestException(
      'passenger.document must be a CPF (11 digits)',
    );
  }
  if (phone.length < 10 || phone.length > 11) {
    throw new BadRequestException('passenger.phone is invalid');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new BadRequestException('passenger.birthDate must be YYYY-MM-DD');
  }

  return { name, email, document, phone, birthDate };
}

export function parsePaymentMethod(value: PaymentMethod | string): PrismaPaymentMethod {
  if (value === PaymentMethod.Pix || value === PaymentMethod.CreditCard) {
    return value;
  }
  throw new BadRequestException(
    `paymentMethod must be ${PaymentMethod.Pix} or ${PaymentMethod.CreditCard}`,
  );
}

export function rpcErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
