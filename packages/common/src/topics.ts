/** Padrões Nest @MessagePattern — RPC gateway ↔ serviços. */
export const TripTopics = {
  Search: 'trip.search',
  GetSeats: 'trip.get-seats',
  GetSeat: 'trip.get-seat',
  HoldSeat: 'trip.hold-seat',
  ConfirmSeat: 'trip.confirm-seat',
  ReleaseSeat: 'trip.release-seat',
} as const;

export const BookingTopics = {
  CreateReservation: 'booking.create-reservation',
  GetReservation: 'booking.get-reservation',
  BeginPayment: 'booking.begin-payment',
  CompensateCheckout: 'booking.compensate-checkout',
  LookupReservation: 'booking.lookup-reservation',
} as const;

export const PaymentTopics = {
  CreatePayment: 'payment.create',
  GetPayment: 'payment.get',
  HandlePspWebhook: 'payment.handle-psp-webhook',
} as const;
