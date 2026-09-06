# API Gateway

BFF HTTP (`:3001`). Traduz REST → RabbitMQ RPC; não é dono de domínio.

## Responsabilidades

- Expor HTTP para o Web (`/trips`, `/reservations`, `/payments`, `/orders`)
- Encaminhar RPC: `trip_queue` · `booking_queue` · `payment_queue`
- Validar header `Idempotency-Key` (pipe) em reserva/pagamento
- Rate limit: 20 req/min em `POST /payments` e `GET /orders/lookup`
- Health + métricas: `GET /health`, `GET /metrics`

## Não faz

- Não persiste Reservation / Payment / Trip
- Não publica eventos de domínio no fanout

## Layout

`src/app/{controllers,services,guards,pipes}`

Docs: [AGENTS.md](../../../AGENTS.md) · [architecture](../../../docs/architecture.md)
