# Compatibility boundary

`kokoro-model` V1 has one runtime path: MySQL + Redis, exposed through the generated Model RPC and the target HTTP readiness/resolve surface.

Rules:

- No PostgreSQL runtime, Prisma legacy table set, or legacy HTTP entrypoint is part of V1.
- MySQL is the durable source of truth; Redis is required for cache and short-lived runtime state.
- Repository writes are the only write path and must invalidate affected Redis route keys after commit.
- Contract consumers use generated types from the Root contract; no handwritten compatibility protocol is allowed.
- Historical migrations and baselines remain outside the runtime migration chain and are not copied into new deployments.
