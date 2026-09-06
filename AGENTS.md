# AGENTS.md — Bus Booking Platform

## Arquitetura

```text
Web ──HTTP──► API Gateway ──RMQ RPC──► Trip | Booking | Payment
                                           │
                                Fanout bus.fanout
                             /         |          \
                        Trip      Booking     Notification → Mailpit
Apps → OTLP :4318 → Grafana LGTM

apps/
  web/
  api/
    api-gateway/   # BFF HTTP; pasta app/{controllers,services,guards,pipes}
    trip-service/  # trip_queue + HTTP health
    booking-service/  # Reservation + Passenger + hold Redis
    payment-service/
    notification-service/  # e-mail via Mailpit
packages/
  common/   # contratos + topics/queues (@repo/common)
  events/   # payloads de domínio (@repo/events)

Diagramas Mermaid: [docs/architecture.md](docs/architecture.md)
```

## Comunicação

| Caminho | Como |
|---------|------|
| Web → Gateway | HTTP |
| Gateway → serviços | RabbitMQ RPC (`ClientProxy.send` / `@MessagePattern`) |
| Payment → Booking (begin payment) | RabbitMQ RPC |
| Booking/Payment → Trip / Notification / Booking | Fanout `bus.fanout` + 1 fila por consumidor |
| Notification → Mailpit | SMTP `:1025` |

Filas RPC: `trip_queue`, `booking_queue`, `payment_queue`.  
Filas domínio (fanout): `trip_domain`, `booking_domain`, `notification_queue`.

## Observabilidade (mínimo)

| Peça | Uso |
|------|-----|
| OpenTelemetry | traces, metrics, logs OTLP |
| Logs JSON | `service`, `level`, `timestamp`, `traceId` |
| RED | `http_requests_total`, `http_request_errors_total`, `http_request_duration_seconds` |
| `/metrics` | scrape Prometheus local por serviço |
| Grafana | http://localhost:3005 |
| Mailpit | http://localhost:8025 |

## Portas

| App | Porta | Path |
|-----|------:|------|
| web | 3000 | `apps/web` |
| api-gateway | 3001 | `apps/api/api-gateway` |
| trip | 3002 | `apps/api/trip-service` |
| booking | 3003 | `apps/api/booking-service` |
| payment | 3004 | `apps/api/payment-service` |
| Grafana LGTM | 3005 | — |
| notification | 3006 | `apps/api/notification-service` |
| Mailpit UI | 8025 | — |
| Mailpit SMTP | 1025 | — |

```sh
pnpm docker:up && pnpm db:setup && pnpm dev
```
