"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPayment, getReservation } from "@/api";
import { digitsOnly } from "@/lib/masks";
import type { PassengerFormInput } from "@/schemas";
import type {
  PassengerData,
  Payment,
  PaymentMethod,
  Reservation,
} from "@/types";

type PayInput = {
  reservation: Reservation;
  form: PassengerFormInput;
};

type Options = {
  tripId: string;
  onReservationUpdate?: (reservation: Reservation) => void;
  onSuccess?: (payment: Payment, reservation: Reservation) => void;
  onError?: (error: Error) => void;
};

function toPassenger(form: PassengerFormInput): PassengerData {
  return {
    name: form.name.trim(),
    email: form.email.trim().toLowerCase(),
    document: digitsOnly(form.document),
    phone: digitsOnly(form.phone),
    birthDate: form.birthDate,
  };
}

/** Key estável por reserva — double-click / retry não cria 2º pagamento. */
function paymentIdempotencyKey(reservationId: string) {
  return `pay-${reservationId}`;
}

export function useCreatePayment({
  tripId,
  onReservationUpdate,
  onSuccess,
  onError,
}: Options) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ reservation, form }: PayInput) => {
      const paymentMethod = form.paymentMethod as PaymentMethod;
      const payment = await createPayment({
        reservationId: reservation.id,
        amountCents: reservation.amountCents,
        idempotencyKey: paymentIdempotencyKey(reservation.id),
        passenger: toPassenger(form),
        paymentMethod,
      });

      let current = reservation;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 400));
        current = await getReservation(reservation.id);
        onReservationUpdate?.(current);
        if (current.status === "CONFIRMED" || current.status === "CANCELLED") {
          break;
        }
      }

      return { payment, reservation: current };
    },
    onSuccess: async ({ payment, reservation }) => {
      await queryClient.invalidateQueries({ queryKey: ["trip-seats", tripId] });
      onSuccess?.(payment, reservation);
    },
    onError: (error: Error) => onError?.(error),
  });
}
