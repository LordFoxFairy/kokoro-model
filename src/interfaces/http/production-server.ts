import type { PrismaClient } from "../../../generated/prisma/index.js";
import type { Redis } from "ioredis";
import { PostgreSQLModelResolver, checkPostgreSQL } from "../../infrastructure/postgresql/model-resolver.js";
import { checkRedis, RedisCachedModelResolver } from "../../infrastructure/redis/model-cache.js";
import { createModelServer } from "./server.js";

export interface ProductionHttpServerDependencies {
  prisma: PrismaClient;
  redis: Redis;
}

/** Composes the single HTTP production surface used by pnpm start and the Docker image. */
export function createProductionHttpServer({ prisma, redis }: ProductionHttpServerDependencies) {
  const postgresqlResolver = new PostgreSQLModelResolver(prisma);
  const resolver = new RedisCachedModelResolver(redis, (request) => postgresqlResolver.resolve(request));

  return createModelServer({
    prisma,
    redis,
    resolver: (request) => resolver.resolve(request),
    readinessChecks: {
      postgresql: () => checkPostgreSQL(prisma),
      redis: () => checkRedis(redis),
    },
  });
}
