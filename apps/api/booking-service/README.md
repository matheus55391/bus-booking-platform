# Booking Service

Reserva e passageiro (`:3003`). Fila RPC: `booking_queue`. Domínio: `booking_domain`.

## Responsabilidades

- Dono de **Reservation**, **Passenger** e **OutboxEvent**
- Hold temporário no **Redis** (`SET NX` + TTL; sem row no PG até pagar)
- Inventário via RPC no Trip (`trip.hold-seat` / `release-seat`) — não escreve Seat
- `beginPayment` → Passenger + Reservation `PENDING_PAYMENT` + `orderCode`
- Confirma / cancela / expira; outbox → `seat.reserved` | `seat.confirmed` | `seat.released`
- RPC `compensate-checkout` (saga do Payment)
- Lookup por `orderCode` + e-mail/CPF

## Fluxo resumido

```text
RPC hold Seat → Hold Redis → beginPayment (PG) → CONFIRMED | CANCELLED | EXPIRED
```

Docs: [AGENTS.md](../../../AGENTS.md) · [architecture](../../../docs/architecture.md)
