# Bus Booking Platform

MVP de estudo — busca, reserva temporária, pagamento e observabilidade.

```text
apps/
  web/
  api/   # api-gateway · trip · booking · payment
```

```text
Web ──HTTP──► API Gateway ──RMQ RPC──► Booking / Trip / Payment
                                    │
                         Fanout bus.fanout → Trip | Booking | Notification
                                    └──► Mailhog (:8025)
```

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
| http://localhost:8025 | Mailhog (e-mails do notification-service) |
| http://localhost:15672 | RabbitMQ UI (bus/bus) |

Apps exportam OTEL para `:4318`. Logs JSON no stdout incluem `traceId`.
Métricas RED + funil em `/metrics` e no Grafana (Prometheus via OTLP).

### Reserva × banco

```text
Selecionar assento → Redis hold + RMQ seat.reserved  (sem row no PG)
Clicar pagar       → Reservation PENDING_PAYMENT     (primeira gravação)
Pagamento OK       → CONFIRMED + seat SOLD
Pagamento falha    → CANCELLED + libera assento
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
