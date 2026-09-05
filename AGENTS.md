# AGENTS.md — Bus Booking Platform

## Arquitetura

```text
Web → Gateway → Trip | Booking | Payment → PostgreSQL
                 ↕ RabbitMQ (trace context)
Apps → OTLP :4318 → Grafana LGTM (Prometheus + Loki + Tempo)
```

## Observabilidade (mínimo)

| Peça | Uso |
|------|-----|
| OpenTelemetry | traces, metrics, logs OTLP |
| Logs JSON | `service`, `level`, `timestamp`, `traceId` |
| RED | `http_requests_total`, `http_request_errors_total`, `http_request_duration_seconds` |
| `/metrics` | scrape Prometheus local por serviço |
| Grafana | http://localhost:3005 |

Sem alertas / SLO neste momento.

## Portas

| App | Porta |
|-----|------:|
| web | 3000 |
| gateway | 3001 |
| trip | 3002 |
| booking | 3003 |
| payment | 3004 |
| Grafana LGTM | 3005 |

```sh
pnpm docker:up && pnpm db:setup && pnpm dev
```
