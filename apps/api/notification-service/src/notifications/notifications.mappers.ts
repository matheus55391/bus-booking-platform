import type {
  PaymentApprovedEvent,
  PaymentFailedEvent,
  SeatConfirmedEvent,
  SeatReleasedEvent,
  SeatReservedEvent,
} from '@repo/events';

export interface MailMessage {
  to: string;
  template: string;
  subject: string;
  text: string;
}

export function formatMoney(cents?: number): string {
  if (cents == null) return '—';
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

export function resolveRecipient(input: {
  email?: string;
  userId?: string;
  defaultTo: string;
}): string {
  if (input.email && input.email.includes('@')) {
    return input.email;
  }
  if (input.userId && input.userId.includes('@')) {
    return input.userId;
  }
  return input.defaultTo;
}

export function seatReservedMail(
  event: SeatReservedEvent,
  to: string,
): MailMessage {
  const expires = new Date(event.expiresAt).toLocaleString('pt-BR');
  return {
    to,
    template: 'seat_reserved',
    subject: `Assento ${event.seatLabel} reservado — finalize o pagamento`,
    text: [
      'Olá!',
      '',
      `Seu assento ${event.seatLabel} foi reservado.`,
      `Reserva: ${event.reservationId}`,
      `Valor: ${formatMoney(event.amountCents)}`,
      `Expira em: ${expires}`,
      '',
      'Conclua o pagamento antes do vencimento para confirmar a passagem.',
      '',
      '— Rodoviária',
    ].join('\n'),
  };
}

export function seatConfirmedMail(
  event: SeatConfirmedEvent,
  to: string,
): MailMessage {
  const greeting = event.passengerName
    ? `Olá, ${event.passengerName}!`
    : 'Olá!';
  return {
    to,
    template: 'seat_confirmed',
    subject: event.orderCode
      ? `Passagem confirmada · ${event.orderCode}`
      : 'Passagem confirmada',
    text: [
      greeting,
      '',
      'Pagamento confirmado! Sua passagem está garantida.',
      '',
      event.orderCode ? `Código do pedido: ${event.orderCode}` : null,
      `Reserva: ${event.reservationId}`,
      event.seatLabel
        ? `Assento: ${event.seatLabel}`
        : `Assento (id): ${event.seatId}`,
      `Viagem: ${event.tripId}`,
      event.amountCents != null
        ? `Valor: ${formatMoney(event.amountCents)}`
        : null,
      '',
      'Guarde este e-mail. Para consultar o pedido, use o código acima com seu e-mail ou CPF.',
      '',
      'Boa viagem!',
      '',
      '— Rodoviária',
    ]
      .filter((line): line is string => line !== null)
      .join('\n'),
  };
}

export function seatExpiredMail(
  event: SeatReleasedEvent,
  to: string,
): MailMessage {
  return {
    to,
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
  };
}

export function paymentApprovedMail(
  event: PaymentApprovedEvent,
  to: string,
): MailMessage {
  return {
    to,
    template: 'payment_approved',
    subject: `Pagamento aprovado · ${event.transactionId}`,
    text: [
      'Recebemos seu pagamento.',
      '',
      `Pagamento: ${event.paymentId}`,
      `Reserva: ${event.reservationId}`,
      `Valor: ${formatMoney(event.amountCents)}`,
      `Transação: ${event.transactionId}`,
      '',
      '— Rodoviária',
    ].join('\n'),
  };
}

export function paymentFailedMail(
  event: PaymentFailedEvent,
  to: string,
): MailMessage {
  return {
    to,
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
  };
}
