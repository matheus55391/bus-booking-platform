# Bus Booking Platform

MVP de estudo — busca, reserva temporária, pagamento e observabilidade.

```text
Web → Gateway → Booking → RabbitMQ → Payment → RabbitMQ → Booking (CONFIRMED)
                         ↘ RabbitMQ → Trip (projeção do assento)
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
| http://localhost:3001 | Gateway |
| http://localhost:3005 | Grafana (Prometheus / Loki / Tempo via OTLP) |
| http://localhost:15672 | RabbitMQ UI (bus/bus) |

Apps exportam OTEL para `:4318`. Logs JSON no stdout incluem `traceId`.
Métricas RED em `/metrics` de cada serviço Nest.
