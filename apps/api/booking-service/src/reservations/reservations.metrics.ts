import { createCounter } from '@repo/observability';

/** Funil: hold criado (ainda não pago). */
export const holdsCreated = createCounter(
  'booking_holds_created_total',
  'Holds de assento criados (funil: início da reserva)',
  ['result', 'origin', 'destination'],
);

/** Funil: pagamento confirmou a reserva. */
export const holdsConfirmed = createCounter(
  'booking_holds_confirmed_total',
  'Holds convertidos em reserva paga (funil: sucesso)',
  ['origin', 'destination'],
);

/** Funil: abandono / TTL estourou. */
export const holdsExpired = createCounter(
  'booking_holds_expired_total',
  'Holds expirados sem pagamento (funil: abandono)',
  ['origin', 'destination', 'reason'],
);
