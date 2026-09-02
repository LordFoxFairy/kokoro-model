import { createPrismaClient } from "../../infrastructure/prisma/prisma-client.js";
import { checkPostgreSQL } from "../../infrastructure/postgresql/model-resolver.js";
import { checkRedis, createRedisClient } from "../../infrastructure/redis/model-cache.js";
import { createProductionHttpServer } from "./production-server.js";

const port = Number(process.env.KOKORO_MODEL_HTTP_PORT ?? process.env.KOKORO_MODEL_PORT ?? "4221");
const prisma = createPrismaClient();
const redis = createRedisClient();
const app = createProductionHttpServer({ prisma, redis });
await Promise.all([checkPostgreSQL(prisma), checkRedis(redis)]);
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
