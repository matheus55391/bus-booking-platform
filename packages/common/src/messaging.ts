/** Filas duráveis — uma por serviço (Nest Transport.RMQ). */
export const ServiceQueues = {
  Trip: "trip_queue",
  Booking: "booking_queue",
  Payment: "payment_queue",
} as const;

export type ServiceQueue = (typeof ServiceQueues)[keyof typeof ServiceQueues];

export const AppService = {
  Trip: "TRIP_SERVICE",
  Booking: "BOOKING_SERVICE",
  Payment: "PAYMENT_SERVICE",
} as const;

export type AppServiceName = (typeof AppService)[keyof typeof AppService];
