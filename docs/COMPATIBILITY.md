# Compatibility boundary

The standalone PostgreSQL runtime is the production target. The copied Prisma/MySQL implementation
is retained only under the migration-source surface while callers move to the generated RPC and
PostgreSQL owner.

Compatibility rules:

- `pnpm legacy:http` is a migration inspection command, not a production entrypoint.
- No new feature may add a Prisma/MySQL write path.
- The compatibility surface must be deleted before the first standalone production release after
  the PostgreSQL cutover; the cutover PR must include owner inventory, data verification, rollback
  evidence, and old-entry removal.
- CI treats the target HTTP/RPC entrypoints and PostgreSQL smoke as the only release path.
