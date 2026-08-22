import { createPrismaClient } from "../../infrastructure/prisma/prisma-client.js";
import { checkMySQL, MySQLModelResolver } from "../../infrastructure/mysql/model-resolver.js";
import { checkRedis, createRedisClient, RedisCachedModelResolver } from "../../infrastructure/redis/model-cache.js";
import { createTargetHttpServer } from "./target-server.js";

const port = Number(process.env.KOKORO_MODEL_HTTP_PORT ?? process.env.KOKORO_MODEL_PORT ?? "4221");
const prisma = createPrismaClient();
const redis = createRedisClient();
const mysqlResolver = new MySQLModelResolver(prisma);
const resolver = new RedisCachedModelResolver(redis, (request) => mysqlResolver.resolve(request));
const app = createTargetHttpServer((request) => resolver.resolve(request), {
  mysql: () => checkMySQL(prisma),
  redis: () => checkRedis(redis),
});
await Promise.all([checkMySQL(prisma), checkRedis(redis)]);
await app.listen({ host: "0.0.0.0", port });
console.log(`kokoro-model HTTP listening on ${port}`);

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  await app.close();
  await redis.quit();
  await prisma.$disconnect();
  console.log(`kokoro-model HTTP stopped after ${signal}`);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
