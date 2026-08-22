# Compatibility boundary

The standalone MySQL runtime is the production target. The copied Prisma/MySQL implementation
is retained only under the migration-source surface while callers move to the generated RPC and
MySQL owner.

Compatibility rules:

- `pnpm legacy:http` is a migration inspection command, not a production entrypoint.
- No new feature may add a Prisma/MySQL write path.
- The compatibility surface must be deleted before the first standalone production release after
  the MySQL cutover; the cutover PR must include owner inventory, data verification, rollback
  evidence, and old-entry removal.
- CI treats the target HTTP/RPC entrypoints and MySQL smoke as the only release path.

## Storage compatibility

The release runtime is MySQL + Redis. MySQL artifacts from the earlier standalone experiment are historical only and are not part of the V1 boot path. The Prisma datasource and migrations use MySQL; Redis is required for readiness and resolve caching.
