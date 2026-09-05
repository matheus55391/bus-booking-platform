# Bus Booking Platform

MVP de estudo — Fase 1: **busca de viagens**.

```text
Passageiro → Web → API Gateway → Trip Service → PostgreSQL
Infra: Postgres | RabbitMQ | Redis
```

## Subir em dev

```sh
# 1) Infra
pnpm docker:up

# 2) Dependências + DB
cp .env.example .env
pnpm install
pnpm db:setup

# 3) Apps
pnpm dev
```

| Serviço | URL |
|---------|-----|
| Web | http://localhost:3000 |
| Gateway | http://localhost:3001 |
| Trip Service | http://localhost:3002 |
| Postgres | localhost:5432 |
| RabbitMQ UI | http://localhost:15672 (bus/bus) |
| Redis | localhost:6379 |

Busca de exemplo: **Aracaju → Salvador**, data **2026-09-10**.
