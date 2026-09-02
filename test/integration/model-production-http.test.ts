import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createRedisClient } from "../../src/infrastructure/redis/model-cache.js";
import { createProductionHttpServer } from "../../src/interfaces/http/production-server.js";
import { cleanModelDatabase, createTestPrismaClient } from "./helpers.js";

const prisma = createTestPrismaClient();
const redis = createRedisClient();
const app = createProductionHttpServer({ prisma, redis });
const tenantId = "00000000-0000-0000-0000-000000000001";

async function clearResolveCache(): Promise<void> {
  const keys = await redis.keys("kokoro:model:resolve:v1:*");
  if (keys.length > 0) await redis.del(...keys);
}

describe("compiled production HTTP composition", () => {
  beforeEach(async () => {
    await cleanModelDatabase(prisma);
    await clearResolveCache();
  });

  afterAll(async () => {
    await app.close();
    await redis.quit();
    await prisma.$disconnect();
  });

  it("serves both the BFF catalog and the existing resolve adapter", async () => {
    const account = await prisma.providerAccount.create({
      data: {
        provider: "openai",
        key: "production-http",
        label: "OpenAI Production HTTP",
        secretRef: "secret://openai/production-http",
        transportKind: "litellm",
      },
    });
    await prisma.modelBinding.create({
      data: {
        providerAccountId: account.id,
        provider: "openai",
        modelName: "gpt-4o",
        displayName: "GPT-4o",
        featureKey: "chat",
        labelKeys: ["chat.default"],
        inputModalities: ["text"],
        outputModalities: ["text"],
        transportKind: "litellm",
        gatewayModelName: "openai/gpt-4o",
        status: "active",
        publishedAt: new Date(),
      },
    });
    await prisma.modelLabel.create({
      data: { key: "chat.default", displayName: "Kokoro Default", featureKey: "chat", status: "active" },
    });

    const catalog = await app.inject({
      method: "GET",
      url: "/bff/model-catalog?featureKey=chat",
      headers: { "x-kokoro-tenant-id": tenantId, "x-kokoro-request-id": "production-catalog" },
    });
    const resolved = await app.inject({
      method: "POST",
      url: "/resolve",
      headers: {
        "x-kokoro-service": "session",
        "x-kokoro-internal-secret": "kokoro-local-session",
        "x-kokoro-tenant-id": tenantId,
      },
      payload: { requestId: "production-resolve", label: "chat.default" },
    });

    expect(catalog.statusCode).toBe(200);
    expect(catalog.json().data.items).toHaveLength(1);
    expect(catalog.json().data.items[0]).toMatchObject({ key: "chat.default", availability: "available" });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json().data).toMatchObject({
      modelRevisionId: expect.any(String),
      providerModelName: "openai/gpt-4o",
      routingPolicyGeneration: "1",
    });
  });
});
