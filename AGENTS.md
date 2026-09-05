# AGENTS.md — Bus Booking Platform

## Arquitetura

```text
Web → API Gateway → Trip | Booking | Payment → PostgreSQL
                     ↕ RabbitMQ (trace context)
Apps → OTLP :4318 → Grafana LGTM (Prometheus + Loki + Tempo)

apps/
  web/
  api/          # backends Nest
    api-gateway/
    trip-service/
    booking-service/
    payment-service/
```

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
