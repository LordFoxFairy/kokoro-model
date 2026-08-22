import { isProductionEnv, loadCallerSecrets, startHttpServer } from "@kokoro/platform-kit";
import { loadModelEnv } from "../../config/env.js";
import { checkRedis, createRedisClient } from "../../infrastructure/redis/model-cache.js";
import { createModelServer } from "./server.js";

const env = loadModelEnv();
const callerSecrets = loadCallerSecrets();
const redis = createRedisClient();
await checkRedis(redis);
await startHttpServer({
  moduleName: "kokoro-model",
  port: env.KOKORO_MODEL_PORT,
  createServer: () =>
    createModelServer({ redis, routeAccess: { secrets: callerSecrets, isProduction: isProductionEnv() } }),
});
