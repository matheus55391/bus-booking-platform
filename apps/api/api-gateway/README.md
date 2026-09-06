# API Gateway

BFF HTTP (`:3001`). Traduz REST → RabbitMQ RPC; não é dono de domínio.

## Swagger / OpenAPI

| URL                             | Conteúdo            |
| ------------------------------- | ------------------- |
| http://localhost:3001/docs      | Swagger UI          |
| http://localhost:3001/docs-json | OpenAPI Spec (JSON) |
| http://localhost:3001/docs-yaml | OpenAPI Spec (YAML) |

## Responsabilidades

- Expor HTTP para o Web (`/trips`, `/reservations`, `/payments`, `/orders`, `/webhooks/psp`)
- Encaminhar RPC: `trip_queue` · `booking_queue` · `payment_queue`
- Validar header `Idempotency-Key` em reserva/pagamento
- Rate limit: 20 req/min em `POST /payments` e `GET /orders/lookup`; 60/min em webhooks
- Health + métricas: `GET /health`, `GET /metrics`
- Documentação OpenAPI em `/docs`

## Não faz

- Não persiste Reservation / Payment / Trip
- Não publica eventos de domínio

## Layout

`src/app/{controllers,services,guards,pipes,dto}`

Docs: [AGENTS.md](../../../AGENTS.md) · [architecture](../../../docs/architecture.md)
