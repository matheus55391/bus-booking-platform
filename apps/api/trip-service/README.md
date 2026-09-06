# Trip Service

Catálogo de viagens e projeção de assentos (`:3002`). Fila RPC: `trip_queue`.

## Responsabilidades

- Dono de **Trip** e **Seat** (Postgres)
- Busca de viagens e mapa de assentos (RPC / via Gateway)
- Consome fanout (`trip_domain`): projeta `HELD` / `SOLD` / liberação a partir de `seat.*`

## Não faz

- Não cria hold Redis nem Reservation
- Não processa pagamento

Docs: [AGENTS.md](../../../AGENTS.md) · [architecture](../../../docs/architecture.md)
