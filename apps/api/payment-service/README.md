# Payment Service

Cobrança e orquestração do checkout (`:3004`). Fila RPC: `payment_queue`.

## Responsabilidades

- Dono de **Payment** e **CheckoutSaga**
- Saga: `beginPayment` (Booking) → charge → publica `payment.approved` / `payment.failed`
- Idempotência: chave estável `pay-{reservationId}` + no máx. 1 PENDING/APPROVED por reserva
- Se a cobrança falha depois do begin: RPC `booking.compensate-checkout`

## Não faz

- Não é dono de Reservation / Passenger
- Sem outbox próprio (lab: publish direto com retry)

🧠 *"Saga de checkout = orquestrador no Payment; se a cobrança falha depois do beginPayment, compensação libera o assento."*

Docs: [AGENTS.md](../../../AGENTS.md) · [architecture](../../../docs/architecture.md)
