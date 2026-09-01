# Compatibility boundary

`kokoro-model` V1 has one runtime path: PostgreSQL + Redis, exposed through the generated Model RPC and the target HTTP readiness/resolve surface.

Rules:

- PostgreSQL is the only durable runtime store; Prisma schema/migrations are the canonical table set.
- PostgreSQL is the durable source of truth; Redis is required for cache and short-lived runtime state.
- Repository writes are the only write path and must invalidate affected Redis route keys after commit.
- Contract consumers use generated types from the Root contract; no handwritten compatibility protocol is allowed.
- The PostgreSQL migration chain and standalone SQL are the only database artifacts used by new deployments.
