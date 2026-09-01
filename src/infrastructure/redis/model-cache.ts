import { Redis } from "ioredis";
import type { ResolveModelRequest } from "../../generated/proto/kokoro/model/v1/model_catalog_pb.js";
import { ModelDependencyError } from "../../domain/model-lifecycle.js";
import type { ModelResolveResult, ModelResolver } from "../../interfaces/rpc/service.js";

const namespace = "kokoro:model:resolve:v1";

function cacheKey(request: Pick<ResolveModelRequest, "tenantId" | "label">): string {
  return `${namespace}:${encodeURIComponent(request.tenantId)}:${encodeURIComponent(request.label)}`;
}

export function createRedisClient(url = process.env.KOKORO_REDIS_URL): Redis {
  if (!url) throw new Error("KOKORO_REDIS_URL is required");
  return new Redis(url, { maxRetriesPerRequest: 1, enableReadyCheck: true });
}

export async function checkRedis(redis: Redis): Promise<void> {
  await redis.ping();
}

export class RedisCachedModelResolver {
  constructor(
    private readonly redis: Redis,
    private readonly resolver: ModelResolver,
    private readonly ttlSeconds = Number(process.env.MODEL_RESOLVE_CACHE_TTL_SECONDS ?? "30"),
  ) {}

  async resolve(request: Parameters<ModelResolver>[0]): Promise<ModelResolveResult | null> {
    const key = cacheKey(request);
    try {
      const cached = await this.redis.get(key);
      if (cached !== null) return deserialize(cached);

      const result = await this.resolver(request);
      await this.redis.setex(key, this.ttlSeconds, JSON.stringify(result, bigintReplacer));
      return result;
    } catch (error) {
      if (error instanceof ModelDependencyError) throw error;
      throw new ModelDependencyError("model route cache is unavailable");
    }
  }

  async invalidate(tenantId?: string, label?: string): Promise<void> {
    try {
      if (tenantId && label) {
        await this.redis.del(cacheKey({ tenantId, label }));
        return;
      }
      const keys = await this.redis.keys(`${namespace}:*`);
      if (keys.length) await this.redis.del(...keys);
    } catch {
      throw new ModelDependencyError("model route cache is unavailable");
    }
  }
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function deserialize(value: string): ModelResolveResult | null {
  const parsed = JSON.parse(value) as (ModelResolveResult & { routingPolicyGeneration: string }) | null;
  if (parsed === null) return null;
  if (typeof parsed.routingPolicyGeneration !== "string") {
    throw new ModelDependencyError("model route cache entry is invalid");
  }
  return { ...parsed, routingPolicyGeneration: BigInt(parsed.routingPolicyGeneration) };
}

/** Wraps repository mutations so PostgreSQL writes cannot leave stale route decisions. */
export function withRedisInvalidation<T extends object>(repository: T, redis: Redis): T {
  const mutations = new Set([
    "ensureProviderAccount", "ensureModelBinding", "ensureModelLabel",
    "setProviderAccountStatus", "setModelBindingStatus", "deleteProviderAccount",
    "restoreProviderAccount", "deleteModelBinding", "restoreModelBinding",
    "upsertTenantModelPolicy",
  ]);
  return new Proxy(repository, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof property !== "string" || !mutations.has(property) || typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        const result = await value.apply(target, args);
        const keys = await redis.keys(`${namespace}:*`);
        if (keys.length) await redis.del(...keys);
        return result;
      };
    },
  });
}
