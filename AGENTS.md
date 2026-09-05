# AGENTS.md — Bus Booking Platform

## Arquitetura

```text
Web ──HTTP──► API Gateway ──RMQ RPC──► Trip | Booking | Payment
                      │                     ↕ domain events (seat.*, payment.*)
                      │                   PostgreSQL
Apps → OTLP :4318 → Grafana LGTM

apps/
  web/
  api/
    api-gateway/   # BFF HTTP; pasta app/{controllers,services,guards,pipes}
    trip-service/  # trip_queue + HTTP health
    booking-service/
    payment-service/
packages/
  common/   # contratos + topics/queues (@repo/common)
  events/   # payloads de domínio (@repo/events)
```

## Comunicação

| Caminho | Como |
|---------|------|
| Web → Gateway | HTTP |
| Gateway → serviços | RabbitMQ RPC (`ClientProxy.send` / `@MessagePattern`) |
| Payment → Booking (validar hold) | RabbitMQ RPC |
| Booking/Payment → Trip (projeção) | eventos tópico `bus.events` |

Filas RPC: `trip_queue`, `booking_queue`, `payment_queue`.

## Observabilidade (mínimo)

| Peça | Uso |
|------|-----|
| OpenTelemetry | traces, metrics, logs OTLP |
| Logs JSON | `service`, `level`, `timestamp`, `traceId` |
| RED | `http_requests_total`, `http_request_errors_total`, `http_request_duration_seconds` |
| `/metrics` | scrape Prometheus local por serviço |
| Grafana | http://localhost:3005 |

## Portas

| App | Porta | Path |
|-----|------:|------|
| web | 3000 | `apps/web` |
| api-gateway | 3001 | `apps/api/api-gateway` |
| trip | 3002 | `apps/api/trip-service` |
| booking | 3003 | `apps/api/booking-service` |
| payment | 3004 | `apps/api/payment-service` |
| Grafana LGTM | 3005 | — |

```sh
pnpm docker:up && pnpm db:setup && pnpm dev
```
