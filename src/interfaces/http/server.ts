import {
  declareRouteAccess,
  registerErrorHandler,
  registerOpenApi,
  registerRouteAccess,
  type RouteAccessConfig,
  type ServiceCaller,
  isProductionEnv,
  loadCallerSecrets,
} from "@kokoro/service-kit";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import Fastify from "fastify";
import { ModelService } from "../../application/model-service.js";
import { createPrismaClient } from "../../infrastructure/prisma/prisma-client.js";
import { PrismaModelRepository } from "../../infrastructure/prisma/prisma-model-repository.js";
import { createRedisClient, withRedisInvalidation } from "../../infrastructure/redis/model-cache.js";
import type { Redis } from "ioredis";
import { registerModelAdminRoutes } from "./admin-routes.js";
import { registerModelRoutes } from "./routes.js";
import {
  registerTargetReadinessRoute,
  registerTargetResolveRoute,
  type ReadinessChecks,
} from "./target-server.js";
import type { ModelResolver } from "../rpc/service.js";

export interface CreateModelServerOptions {
  prisma?: PrismaClient;
  // 入站访问控制配置；不传时从环境读取 per-caller secret，并按 NODE_ENV/KOKORO_ENV 判定生产模式。
  routeAccess?: RouteAccessConfig;
  redis?: Redis;
  // Production HTTP also carries the compatibility target adapter used by local runtime smoke.
  resolver?: ModelResolver;
  readinessChecks?: ReadinessChecks;
}

// model 所需 caller 凭据：agent(model-bindings/resolve 可用性权威) + admin(网关) 入站。model 无出站。
const MODEL_REQUIRED_CALLERS: ServiceCaller[] = ["agent", "admin", "web-bff"];

export function createModelServer(options: CreateModelServerOptions = {}) {
  const app = Fastify({
    logger: false,
  });

  // WHY: swagger 的 onRoute 钩子须先于路由装好，故 registerOpenApi 须在任何路由注册前调用。
  registerOpenApi(app, { title: "Kokoro Model API", version: "0.1.0" });

  // 服务间被调面：default-internal。/healthz 公开；/admin 仅 admin 网关；provider-accounts/model-bindings 归 runtime-internal。
  const ra = options.routeAccess ?? { secrets: loadCallerSecrets(), isProduction: isProductionEnv() };
  registerRouteAccess(app, { ...ra, requiredCallers: MODEL_REQUIRED_CALLERS });
  declareRouteAccess(app, { path: "/healthz", exact: true }, "public");
  declareRouteAccess(app, { path: "/metrics", exact: true }, "public");
  declareRouteAccess(app, "/admin", "admin");
  declareRouteAccess(app, "/provider-accounts", "runtime-internal");
  declareRouteAccess(app, "/model-bindings", "runtime-internal");
  declareRouteAccess(app, "/model-labels", "runtime-internal");
  declareRouteAccess(app, "/bff/model-catalog", "web-bff");
  declareRouteAccess(app, "/docs", "runtime-internal");
  if (options.resolver !== undefined) {
    declareRouteAccess(app, { path: "/readyz", exact: true }, "public");
    // Production /resolve is an internal adapter; the body must not establish tenant ownership.
    declareRouteAccess(app, { path: "/resolve", exact: true }, "runtime-internal");
  }
  registerErrorHandler(app);

  const prisma = options.prisma ?? createPrismaClient();
  const baseRepository = new PrismaModelRepository(prisma);
  const ownedRedis = options.redis ? undefined : (process.env.KOKORO_REDIS_URL ? createRedisClient() : undefined);
  const redis = options.redis ?? ownedRedis;
  const repository = redis ? withRedisInvalidation(baseRepository, redis) : baseRepository;
  const service = new ModelService(repository);

  // WHY: 路由须包进异步 plugin，确保在 swagger(void register 入队)之后加载，否则 onRoute 漏采 → /docs/json paths 为空。
  void app.register(async (instance) => {
    if (options.resolver !== undefined) {
      registerTargetReadinessRoute(instance, options.readinessChecks);
      registerTargetResolveRoute(instance, options.resolver);
    }
    registerModelRoutes(instance, service);
    registerModelAdminRoutes(instance, repository);
  });

  app.addHook("onClose", async () => {
    if (ownedRedis) await ownedRedis.quit();
    if (!options.prisma) await prisma.$disconnect();
  });

  return app;
}
