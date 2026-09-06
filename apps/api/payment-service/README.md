# Payment Service

Cobrança e orquestração do checkout (`:3004`). Fila RPC: `payment_queue`.

## Responsabilidades

- Dono de **Payment**, **CheckoutSaga**, **OutboxEvent**, **PspWebhookEvent**
- Saga: `beginPayment` → charge sync **ou** `asyncCharge` + webhook PSP
- Idempotência create: `pay-{reservationId}`
- Webhook: `payment.handle-psp-webhook` (via Gateway `POST /webhooks/psp`) — dedupe por `providerEventId`
- Falha após begin: RPC `booking.compensate-checkout`

## Demo async PSP

```http
POST /payments  (asyncCharge: true) → status PENDING
POST /webhooks/psp
{ "providerEventId": "psp_evt_1", "paymentId": "...", "status": "APPROVED" }
```

Replay do mesmo `providerEventId` → `idempotentReplay: true`.

🧠 _"Saga de checkout = orquestrador no Payment; se a cobrança falha depois do beginPayment, compensação libera o assento."_

Docs: [AGENTS.md](../../../AGENTS.md) · [architecture](../../../docs/architecture.md)
