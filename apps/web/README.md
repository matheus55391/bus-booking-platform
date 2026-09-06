# Web

Frontend Next.js (`:3000`). UI do guest checkout.

## Responsabilidades

- Busca de viagens e mapa de assentos
- Hold de assento (`POST /reservations` + `Idempotency-Key` sticky)
- Checkout: dados do passageiro + Pix/Cartão (método vai na API; campos de cartão só UI)
- Consulta de pedido em `/pedido` (`orderCode` + e-mail/CPF)

## Não faz

- Não fala com microserviços direto — só **API Gateway** (`:3001`)

Docs: [AGENTS.md](../../AGENTS.md) · [architecture](../../docs/architecture.md)
