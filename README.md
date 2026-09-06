# Bus Booking Platform

MVP de estudo — busca, hold Redis, pagamento (saga), outbox, e-mail e observabilidade.

## Quem faz o quê

| App | Porta | Dono / papel |
|-----|------:|--------------|
| [web](apps/web) | 3000 | UI guest checkout |
| [api-gateway](apps/api/api-gateway) | 3001 | BFF HTTP → RPC (sem domínio) |
| [trip-service](apps/api/trip-service) | 3002 | Trip + Seat (projeção) |
| [booking-service](apps/api/booking-service) | 3003 | Hold Redis, Reservation, Passenger, Outbox |
| [payment-service](apps/api/payment-service) | 3004 | Payment + saga de checkout |
| Grafana LGTM | 3005 | traces / metrics / logs |
| [notification-service](apps/api/notification-service) | 3006 | e-mail (Mailpit) |
| Mailpit | 8025 / 1025 | UI / SMTP local |

```text
Web ──HTTP──► API Gateway ──RMQ RPC──► Trip | Booking | Payment
                                    │
                         Fanout bus.fanout
                      /        |         \
                   Trip     Booking   Notification → Mailpit
```

Diagramas: [docs/architecture.md](docs/architecture.md) · mapa curto: [AGENTS.md](AGENTS.md)

## Subir

```sh
pnpm docker:up
pnpm install
pnpm db:setup
pnpm dev
```

| URL | Serviço |
|-----|---------|
| http://localhost:3000 | Web |
| http://localhost:3001 | API Gateway |
| http://localhost:3005 | Grafana (Prometheus / Loki / Tempo via OTLP) |
| http://localhost:8025 | Mailpit |
| http://localhost:15672 | RabbitMQ UI (bus/bus) |

Apps exportam OTEL para `:4318`. Logs JSON no stdout incluem `traceId`.

### Reserva × banco

```text
Selecionar assento → Redis hold + outbox seat.reserved  (sem row no PG)
Clicar pagar       → Reservation PENDING_PAYMENT         (primeira gravação)
Pagamento OK       → CONFIRMED + seat SOLD
Pagamento falha    → compensate → CANCELLED + libera assento
TTL estoura        → EXPIRED / libera hold
```

### Funil (booking / payment)

| Métrica | Significado |
|---------|-------------|
| `booking_holds_created_total` | Hold criado |
| `booking_holds_confirmed_total` | Pagou e confirmou |
| `booking_holds_expired_total` | Abandonou / TTL |
| `payment_processed_total` | approved / failed / idempotent |

Grafana: http://localhost:3005 → **Explore**
- Loki: `{service="booking-service"} |= "hold_"`
- Prometheus: `booking_holds_created_total`
- Tempo: search `booking-service` após uma reserva
