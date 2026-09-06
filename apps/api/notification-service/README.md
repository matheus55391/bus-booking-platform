# Notification Service

E-mail a partir de eventos de domínio (`:3006`). Consome `notification_queue` (fanout `bus.fanout`).

## Responsabilidades

- Ouvir `seat.confirmed` (e correlatos) e enviar ticket por SMTP
- Em local: **Mailpit** UI `:8025` / SMTP `:1025`

## Não faz

- Não altera Reservation / Payment / Seat
- Sem idempotência de e-mail no lab (at-least-once pode duplicar)

Docs: [AGENTS.md](../../../AGENTS.md) · [architecture](../../../docs/architecture.md)
