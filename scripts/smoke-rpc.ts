import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { ModelCatalogService } from "../src/generated/proto/kokoro/model/v1/model_catalog_pb.js";
import { createPrismaClient } from "../src/infrastructure/prisma/prisma-client.js";
import { MySQLModelResolver } from "../src/infrastructure/mysql/model-resolver.js";
import { createRedisClient, RedisCachedModelResolver } from "../src/infrastructure/redis/model-cache.js";
import { PrismaModelRepository } from "../src/infrastructure/prisma/prisma-model-repository.js";
import { createModelRpcServer } from "../src/interfaces/rpc/server.js";

const tenantId = "00000000-0000-0000-0000-000000000011";
const prisma = createPrismaClient();
const redis = createRedisClient();
const repo = new PrismaModelRepository(prisma);
const account = await repo.ensureProviderAccount({ provider: "smoke", key: "rpc", label: "RPC", secretRef: "smoke", transportKind: "litellm" });
const binding = await repo.ensureModelBinding({ providerAccountId: account.id, modelName: "rpc-model", displayName: "RPC Model", featureKey: "default", labelKeys: ["default"], inputModalities: ["text"], outputModalities: ["text"], transportKind: "litellm" });
const resolver = new RedisCachedModelResolver(redis, (request) => new MySQLModelResolver(prisma).resolve(request));
const server = createModelRpcServer((request) => resolver.resolve(request));
try {
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => resolve()); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("RPC server did not bind");
  const client = createClient(ModelCatalogService, createConnectTransport({ baseUrl: `http://127.0.0.1:${address.port}`, httpVersion: "1.1" }));
  const response = await client.resolveModel({ requestId: "rpc-smoke", tenantId, label: "default" });
  if (response.modelRevisionId !== binding.id) throw new Error("RPC smoke returned an unexpected route");
  console.log("kokoro-model MySQL + Redis generated RPC smoke passed");
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve())).catch(() => undefined);
  await redis.del(`kokoro:model:resolve:v1:${encodeURIComponent(tenantId)}:default`).catch(() => undefined);
  await prisma.modelBinding.delete({ where: { id: binding.id } }).catch(() => undefined);
  await prisma.providerAccount.delete({ where: { id: account.id } }).catch(() => undefined);
  await redis.quit();
  await prisma.$disconnect();
}
