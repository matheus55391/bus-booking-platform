# Booking Service

Reserva e passageiro (`:3003`). Fila RPC: `booking_queue`. Domínio: `booking_domain`.

## Responsabilidades

- Dono de **Reservation**, **Passenger** e **OutboxEvent**
- Hold temporário no **Redis** (`SET NX` + TTL; sem row no PG até pagar)
- Concorrência: `UPDATE Seat WHERE AVAILABLE` + Redis no assento
- `beginPayment` → Passenger + Reservation `PENDING_PAYMENT` + `orderCode`
- Confirma / cancela / expira; outbox → `seat.reserved` | `seat.confirmed` | `seat.released`
- RPC `compensate-checkout` (saga do Payment)
- Lookup por `orderCode` + e-mail/CPF
- Cron healing: `PENDING_PAYMENT` / Seat `HELD` órfãos sem Redis

## Fluxo resumido

```text
Hold (Redis) → beginPayment (PG) → CONFIRMED | CANCELLED | EXPIRED
```

Docs: [AGENTS.md](../../../AGENTS.md) · [architecture](../../../docs/architecture.md)
