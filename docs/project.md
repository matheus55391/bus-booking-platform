# Bus Booking Platform — Projeto, casos de uso e escolhas técnicas

Lab de **System Design** (não um produto SaaS completo): modelar a venda de passagem de ônibus com concorrência realista, consistência entre serviços e observabilidade.

Diagramas vivos: [`architecture.md`](./architecture.md) · mapa curto: [`AGENTS.md`](../AGENTS.md)

---

## 1. O que é o projeto

Monorepo (pnpm + Turbo) com:

| Camada | Conteúdo |
|--------|----------|
| **Web** | Next.js — busca, mapa de assentos, checkout guest, consulta de pedido |
| **API Gateway** | BFF HTTP → RabbitMQ RPC (sem dono de domínio) |
| **Serviços** | Trip · Booking · Payment · Notification |
| **Contratos** | `@repo/common`, `@repo/events`, `@repo/messaging`, `@repo/observability` |
| **Deps locais** | Postgres, Redis, RabbitMQ, Mailpit, Grafana LGTM (`docker-compose.yml`) |

**Modelo de negócio (guest):** não há conta de usuário. Passageiro informa dados no pagamento; recebe e-mail do ticket; consulta o pedido com `orderCode` + e-mail ou CPF.

---

## 2. Casos de uso

### UC1 — Buscar viagens

1. Usuário informa origem, destino e data.
2. Web → Gateway → Trip (`trip.search`).
3. Lista viagens com preço e assentos disponíveis (contador eventual).

### UC2 — Ver mapa de assentos

1. Usuário abre uma viagem.
2. Trip devolve assentos `AVAILABLE` / `HELD` / `SOLD`.
3. UI destaca o que ainda pode ser escolhido.

### UC3 — Segurar assento (hold)

1. Usuário clica num assento livre.
2. Web envia `POST /reservations` com header **`Idempotency-Key`** (sticky por assento).
3. Booking:
   - RPC `trip.hold-seat` → Trip faz `UPDATE Seat … AVAILABLE → HELD` (dono do inventário);
   - grava hold no **Redis** (`SET NX` + TTL);
   - publica `seat.reserved` via outbox (notificação / projeção).
4. **Ainda não existe** `Reservation` no Postgres.
5. UI mostra countdown do TTL (curto em dev, via `RESERVATION_HOLD_TTL_SECONDS`).

**E se falhar?** Assento já HELD e Redis falha → Booking pede `trip.release-seat`. Duas abas com a mesma key → replay idempotente.

### UC4 — Pagar (checkout guest)

1. Usuário preenche passageiro + Pix ou Cartão (cartão é só UI; API recebe o método).
2. Web → Gateway → Payment (`payment.create`) com idempotency key estável `pay-{reservationId}`.
3. **Saga orquestrada no Payment:**
   1. RPC `booking.begin-payment` → cria `Passenger` + `Reservation` `PENDING_PAYMENT` + `orderCode`; renova TTL do hold.
   2. Charge mock (pode forçar falha).
   3. Outbox `payment.approved` ou `payment.failed`.
4. Booking, ao receber `payment.approved`:
   - `PENDING_PAYMENT` → `CONFIRMED` + outbox `seat.confirmed` (mesma tx);
   - Trip marca assento `SOLD`; Notification manda e-mail (Mailpit).
5. Se charge falha depois do begin → RPC `booking.compensate-checkout` (CANCELLED + libera hold/assento).

🧠 *"Saga de checkout = orquestrador no Payment; se a cobrança falha depois do beginPayment, compensação libera o assento."*

### UC5 — Consultar pedido

1. Usuário em `/pedido` informa `orderCode` + e-mail ou CPF.
2. Booking faz lookup do `Passenger` / `Reservation`.
3. Gateway aplica **rate limit** (20/min) nesse endpoint (e em `POST /payments`).

### UC6 — Expiração / abandono

- TTL do Redis estoura → Booking libera hold + `seat.released` → Trip volta assento a `AVAILABLE`.
- Healing: Booking trata `PENDING_PAYMENT` órfão sem Redis; Trip limpa `HELD` stale.

---

## 3. Atores e donos de dado

| Dado | Dono | Por quê |
|------|------|---------|
| Trip / Seat | **Trip** | Inventário único; evita dois writers no mesmo assento |
| Hold (Redis) | **Booking** | Soft-lock barato com TTL; sem poluir PG com abandono |
| Reservation / Passenger / Outbox (booking) | **Booking** | Pedido e passageiro nascem no checkout |
| Payment / CheckoutSaga / Outbox (payment) | **Payment** | Cobrança + orquestração da saga |
| E-mail | **Notification** | Side-effect; não altera domínio |

Gateway **não** é dono de nada: só HTTP, validação de idempotency key, throttle e RPC.

---

## 4. Escolhas técnicas

### 4.1 Microserviços + BFF (não monólito puro)

**Escolha:** NestJS por serviço + API Gateway HTTP.

**Por quê (lab):** forçar fronteiras, messaging, falhas parciais e donos de dado — o que aparece em entrevista de System Design.

**Atalho consciente:** um Postgres compartilhado (`bus_booking`). Em produção seria DB-per-service (ou schema + zero cross-write). O código já evita Booking escrever `Seat` (usa RPC no Trip).

### 4.2 Hold no Redis antes do Postgres

**Escolha:** assento “reservado” = Redis + Seat `HELD`; row `Reservation` só no `beginPayment`.

**Por quê:** a maioria abandona no mapa. Escrever PG cedo = lixo, contensão e migrações de status sem valor.

**Trade-off:** duas fontes (Redis + Seat). Compensado com TTL, healing e liberação via eventos/RPC.

### 4.3 Concorrência do assento

**Escolha:**

1. Trip: `UPDATE Seat SET HELD WHERE AVAILABLE` (atômico no inventário).
2. Booking: Redis `SET NX` no assento (lock rápido / idempotência).

**Por quê:** “dois usuários no mesmo assento” é o caso clássico. Sem conditional update, last-write-wins vende assento duas vezes.

### 4.4 Outbox transacional

**Escolha:** `OutboxEvent` na mesma tx do estado (Booking e Payment); relay publica no Rabbit.

**Por quê:** evita dual-write (commit OK + publish falha → sistema mentiroso).

**Trade-off do lab:** relay in-process com cron 1s (sem `SKIP LOCKED` / CDC). Serve para aprender; N réplicas pediria claim de linha ou Debezium.

### 4.5 Saga orquestrada no Payment

**Escolha:** Payment conduz begin → charge → evento; compensação explícita no Booking.

**Alternativas:** coreografia só por eventos; orquestrador no Booking. Payment como orquestrador deixa a cobrança no centro do fluxo financeiro — narrativa forte em entrevista.

### 4.6 RabbitMQ: RPC + topic

| Uso | Mecanismo |
|-----|-----------|
| Sync (busca, hold, pay, begin) | RPC nas filas `*_queue` (Nest `ClientProxy`) |
| Async (seat.* / payment.*) | Exchange **topic** `bus.topic` + 1 fila por consumidor |
| Falha no consumer | `nack(requeue=false)` → DLX `bus.dlx` → `{queue}.dlq` |

**Por quê topic (não fanout):** routing key (`seat.confirmed`, `payment.approved`) seleciona quem recebe — modelo mental correto para eventos tipados.

**Pacote `@repo/messaging`:** um `RabbitMqService` compartilhado (antes eram 4 cópias idênticas).

### 4.7 Idempotência

- Hold: header `Idempotency-Key` + Redis NX (+ unique no PG quando vira Reservation).
- Pagamento: key estável `pay-{reservationId}` + unique + no máx. 1 PENDING/APPROVED por reserva.
- Confirm: `updateMany` só se ainda `PENDING_PAYMENT`.

**Por quê:** retry de rede / double-click / reload não podem cobrar ou confirmar duas vezes.

### 4.8 Observabilidade mínima (RED + OTEL)

**Escolha:** OpenTelemetry → Grafana LGTM; logs JSON com `traceId`; métricas de funil (`booking_holds_*`, `payment_processed_total`).

**Por quê:** sem telemetria, saga e outbox viram caixa-preta. Lab treina “como eu debugaria em produção”.

### 4.9 Notification + Mailpit

**Escolha:** SMTP local (Mailpit), e-mail no `seat.confirmed` para o e-mail real do passageiro.

**Trade-off:** at-least-once pode duplicar e-mail (sem idempotência de envio no lab).

### 4.10 Stack de app

| Peça | Escolha | Motivo no lab |
|------|---------|----------------|
| Monorepo | pnpm workspaces + Turbo | Contratos versionados junto com serviços |
| Backend | NestJS | Microservices + RPC + DI familiares no mercado BR |
| ORM | Prisma (schema por serviço) | Migrações claras; client gerado `@bus/*-prisma` |
| Web | Next.js App Router | UI rápida para exercitar o funil |
| Cache / hold | Redis | TTL nativo |
| Broker | RabbitMQ | RPC + topic + DLQ num só lugar |

---

## 5. Fluxo ponta a ponta (resumo)

```text
Busca (Trip)
  → Hold: Trip.hold-seat + Redis + seat.reserved
  → Pay: Saga Payment → beginPayment (PG) → charge → payment.*
  → OK: Reservation CONFIRMED + seat.confirmed + e-mail
  → Fail: compensate-checkout + libera assento
  → Lookup: orderCode + e-mail/CPF
```

```text
Selecionar assento → Redis hold + outbox seat.reserved   (sem row no PG)
Clicar pagar       → Reservation PENDING_PAYMENT           (primeira gravação)
Pagamento OK       → CONFIRMED + seat SOLD
Pagamento falha    → compensate → CANCELLED + libera
TTL estoura        → EXPIRED / libera hold
```

---

## 6. O que o lab aceita (e o que você deve verbalizar)

| Aceitável aqui | Em produção você citaría |
|----------------|---------------------------|
| Postgres único | DB (ou schema) por serviço |
| Relay outbox no mesmo processo | Worker / CDC + `SKIP LOCKED` |
| Payment gateway mock | PSP real + webhooks |
| E-mail sem dedupe | Idempotency key de notificação |
| `availableSeats` eventual | Contador derivado ou read model forte |

---

## 7. Como subir e onde olhar

```sh
pnpm docker:up && pnpm db:setup && pnpm dev
```

| URL | Uso |
|-----|-----|
| http://localhost:3000 | Web |
| http://localhost:3001 | Gateway |
| http://localhost:3005 | Grafana (traces / metrics / logs) |
| http://localhost:8025 | Mailpit (tickets) |
| http://localhost:15672 | RabbitMQ (bus/bus) |

Se filas domain forem criadas com args antigos (fanout/DLX), delete `trip_domain`, `booking_domain`, `notification_queue` na UI e reinicie os serviços.

---

## 8. Mapa mental para entrevista

1. **Problema:** vender assento sem overbooking, com abandono alto e pagamento distribuído.
2. **Hold barato:** Redis + inventário no Trip; PG só quando paga.
3. **Atomicidade evento/estado:** outbox.
4. **Checkout multi-serviço:** saga no Payment + compensação.
5. **Observabilidade:** sem ela você não prova que a saga funcionou.

Frase-âncora: *“Saga de checkout = orquestrador no Payment; se a cobrança falha depois do beginPayment, compensação libera o assento.”*
