import { checkRedis, createRedisClient } from "../src/infrastructure/redis/model-cache.js";
const redis = createRedisClient();
await checkRedis(redis);
console.log("redis smoke ok");
await redis.quit();
