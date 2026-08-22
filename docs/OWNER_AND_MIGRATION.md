# Owner and migration contract

## Owner

`@kokoro/model` is the sole runtime writer for the model bounded context:

- `model_provider`
- `model_definition`
- `model_revision`
- `model_routing_policy`
- `model_provider_health_state`

Agent and Credit may persist `model_revision_id` references, but never write Model tables.

## Migration source and target

The current `prisma/schema.prisma` is a migration source only. The target MySQL schema is
owned by the Root repository at `database/schema/60-model.sql`. Migration work must preserve
secretRef-only storage, create immutable revisions for changed bindings, and cut over to one
runtime writer before deleting the legacy write surface.

## Completion evidence

A migration is complete only when schema inventory, contract generation, architecture tests,
integration tests, deployment smoke, and legacy-entry removal/compatibility expiry all agree.

## V1 storage owner

`infrastructure/prisma` and `infrastructure/mysql` own MySQL access. `infrastructure/redis` owns cache and invalidation semantics. Repository changes go through `PrismaModelRepository`; interfaces and RPC contracts do not import either client directly.
