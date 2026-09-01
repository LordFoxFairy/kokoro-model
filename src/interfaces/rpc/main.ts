import { createPrismaClient } from "../../infrastructure/prisma/prisma-client.js";
import { checkPostgreSQL, PostgreSQLModelResolver } from "../../infrastructure/postgresql/model-resolver.js";
import { checkRedis, createRedisClient, RedisCachedModelResolver } from "../../infrastructure/redis/model-cache.js";
import { createModelRpcServer } from "./server.js";

const port = Number(process.env.KOKORO_MODEL_RPC_PORT ?? "4222");
const prisma = createPrismaClient();
const redis = createRedisClient();
const postgresqlResolver = new PostgreSQLModelResolver(prisma);
const resolver = new RedisCachedModelResolver(redis, (request) => postgresqlResolver.resolve(request));
await Promise.all([checkPostgreSQL(prisma), checkRedis(redis)]);
const server = createModelRpcServer((request) => resolver.resolve(request));
server.listen(port, "0.0.0.0", () => console.log(`kokoro-model RPC listening on ${port}`));

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  server.close(async () => {
    await redis.quit();
    await prisma.$disconnect();
    console.log(`kokoro-model RPC stopped after ${signal}`);
  });
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
