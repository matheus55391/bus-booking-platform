# Trip Service

Catálogo de viagens e inventário de assentos (`:3002`). Fila RPC: `trip_queue`.

## Responsabilidades

- Dono de **Trip** e **Seat** (único writer)
- Busca + mapa de assentos
- RPC inventário: `hold-seat` / `confirm-seat` / `release-seat` / `get-seat`
- Consome `seat.confirmed` / `seat.released` (topic) para reforçar inventário
- Healing: HELD stale

## Não faz

- Não cria hold Redis nem Reservation
- Não processa pagamento

Docs: [AGENTS.md](../../../AGENTS.md) · [architecture](../../../docs/architecture.md)
