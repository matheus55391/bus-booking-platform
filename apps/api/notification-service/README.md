# Notification Service

E-mail a partir de eventos de domínio (`:3006`). Consome `notification_queue` (topic `bus.topic`).

## Responsabilidades

- Ouvir `seat.*` / `payment.*` e enviar e-mail por SMTP
- Em local: **Mailpit** UI `:8025` / SMTP `:1025`

## Não faz

- Não altera Reservation / Payment / Seat
- Sem dedupe de e-mail no lab (at-least-once pode duplicar — aceitável)

Docs: [AGENTS.md](../../../AGENTS.md) · [architecture](../../../docs/architecture.md)
