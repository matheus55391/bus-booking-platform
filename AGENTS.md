# AGENTS.md — Bus Booking Platform

Laboratório de System Design (MVP). Fase 1: busca de viagens.

## Arquitetura (Fase 1)

```text
Passageiro → Web → API Gateway → Trip Service → PostgreSQL
Infra: Postgres | RabbitMQ | Redis (compose)
```

## Apps

| App | Papel | Porta |
|-----|-------|------:|
| `apps/web` | Frontend passageiro | 3000 |
| `apps/gateway` | API Gateway (NestJS) | 3001 |
| `apps/trip-service` | Catálogo/busca de viagens | 3002 |

## Comandos

```sh
pnpm docker:up      # Postgres, RabbitMQ, Redis
pnpm dev            # web + gateway + trip-service
```

## Escopo atual

Fluxos:
1. Buscar viagens (`GET /trips/search`)
2. Ver assentos (`GET /trips/{tripId}/seats`) — status `AVAILABLE | HELD | SOLD`

Seed local: 4 viagens, 40 assentos cada (layout 2+2).

Ainda não: hold/pagamento, consumers RabbitMQ/Redis.
