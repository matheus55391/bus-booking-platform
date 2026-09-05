/** Padrões Nest @MessagePattern — RPC gateway ↔ serviços. */
export const TripTopics = {
  Search: "trip.search",
  GetSeats: "trip.get-seats",
} as const;

export const BookingTopics = {
  CreateReservation: "booking.create-reservation",
  GetReservation: "booking.get-reservation",
  BeginPayment: "booking.begin-payment",
} as const;

export const PaymentTopics = {
  CreatePayment: "payment.create",
  GetPayment: "payment.get",
} as const;
