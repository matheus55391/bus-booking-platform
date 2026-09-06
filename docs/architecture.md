# Arquitetura — Bus Booking Platform

Fonte visual viva. Atualizar junto com mudanças de serviço, messaging ou fluxo (ver rule `docs-architecture`).

## Visão geral

```mermaid
flowchart LR
  Web[Web :3000] -->|HTTP| GW[API Gateway :3001]
  GW -->|RPC trip_queue| Trip[Trip :3002]
  GW -->|RPC booking_queue| Booking[Booking :3003]
  GW -->|RPC payment_queue| Payment[Payment :3004]
  Payment -->|RPC BeginPayment| Booking
  Booking -->|fanout bus.fanout| Fanout((bus.fanout))
  Payment -->|fanout bus.fanout| Fanout
  Fanout --> TripDomain[trip_domain]
  Fanout --> BookingDomain[booking_domain]
  Fanout --> NotifQ[notification_queue]
  NotifQ --> Notif[Notification :3006]
  Notif -->|SMTP :1025| Mailpit[Mailpit :8025]
  Apps[Apps] -->|OTLP :4318| LGTM[Grafana LGTM :3005]
```

## Domínio (donos)

| Dado | Dono |
|------|------|
| Trip / Seat | Trip Service |
| Hold (Redis) + Reservation + Passenger | Booking Service |
| Payment | Payment Service |
| E-mail | Notification Service |

- Hold não pago: **só Redis** + evento `seat.reserved` (sem row de Reservation).
- Postgres: Reservation entra em `PENDING_PAYMENT` no `beginPayment`, com `Passenger` relacionado.
- Depois: `CONFIRMED` / `CANCELLED` / `EXPIRED`.

## Fluxo guest checkout

```mermaid
sequenceDiagram
  participant Web
  participant GW as Gateway
  participant Booking
  participant Payment
  participant Notif
  participant Mailpit

  Web->>GW: POST /reservations (hold)
  GW->>Booking: booking.create-reservation
  Booking-->>Web: status RESERVED (Redis)

  Web->>GW: POST /payments + passenger + method
  GW->>Payment: payment.create
  Payment->>Booking: booking.begin-payment
  Booking->>Booking: Passenger + Reservation PENDING_PAYMENT + orderCode
  Payment-->>Payment: mock APPROVED
  Payment-->>Notif: payment.approved
  Booking-->>Notif: seat.confirmed
  Notif->>Mailpit: ticket para passenger.email

  Web->>GW: GET /orders/lookup?orderCode&email|document
  GW->>Booking: booking.lookup-reservation
```

## Filas e topics

| Tipo | Nome |
|------|------|
| RPC | `trip_queue`, `booking_queue`, `payment_queue` |
| Fanout | `bus.fanout` → `trip_domain`, `booking_domain`, `notification_queue` |
| Eventos | `seat.reserved`, `seat.confirmed`, `seat.released`, `payment.approved`, `payment.failed` |

## Contratos

- `@repo/common` — DTOs HTTP/RPC, topics, queues
- `@repo/events` — payloads fanout + `EXCHANGE` / `EXCHANGE_TYPE`

## Garantias (lab)

| Tema | Como |
|------|------|
| Concorrência assento | `UPDATE Seat WHERE AVAILABLE` + Redis `SET NX` no assento |
| Idempotência hold | Header `Idempotency-Key` → Redis `SET NX` + unique em Reservation |
| Idempotência pagamento | Key estável `pay-{reservationId}` + unique key + no máximo 1 PENDING/APPROVED por reserva |
| Confirm atômico | `updateMany` só se `PENDING_PAYMENT` + Seat → `SOLD` na mesma tx |
| Checkout vs TTL | `refresh` Redis no `beginPayment` (janela extra) |

Aceitável no lab (não overengineer): `availableSeats` eventual; fanout at-least-once (handlers idempotentes); sem outbox/saga.
