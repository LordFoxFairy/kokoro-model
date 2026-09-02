import { describe, expect, it } from "vitest";
import type { ModelResolveResult } from "../../src/interfaces/rpc/service.js";
import { ModelDependencyError } from "../../src/domain/errors.js";
import { PrismaClient } from "../../generated/prisma/index.js";
import { createModelServer } from "../../src/interfaces/http/server.js";
import { createTargetHttpServer } from "../../src/interfaces/http/target-server.js";

const result: ModelResolveResult = {
  modelRevisionId: "00000000-0000-0000-0000-000000000001",
  providerId: "00000000-0000-0000-0000-000000000002",
  providerModelName: "gpt-test",
  transport: 1,
  routingPolicyId: "00000000-0000-0000-0000-000000000003",
  routingPolicyGeneration: 1n,
  digest: "digest",
};

describe("target PostgreSQL + Redis HTTP boundary", () => {
  it("composes the production HTTP server with both catalog and resolve routes", async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: "file:./production-http-test.db" } } });
    const app = createModelServer({
      prisma,
      resolver: async () => result,
      readinessChecks: { postgresql: async () => undefined, redis: async () => undefined },
      routeAccess: { secrets: {}, isProduction: false, insecureLocal: true },
    });

    const ready = await app.inject({ method: "GET", url: "/readyz" });
    const catalog = await app.inject({ method: "GET", url: "/bff/model-catalog" });
    const response = await app.inject({
      method: "POST",
      url: "/resolve",
      headers: { "x-kokoro-tenant-id": result.modelRevisionId },
      payload: { requestId: "request-1", label: "default" },
    });

    expect(ready.statusCode).toBe(200);
    expect(catalog.statusCode).toBe(400);
    expect(catalog.json().error.code).toBe("model.tenant_required");
    expect(response.statusCode).toBe(200);
    expect(response.json().data.modelRevisionId).toBe(result.modelRevisionId);
    await app.close();
    await prisma.$disconnect();
  });

  it("rejects unauthenticated /resolve requests before a browser-controlled tenant can act as owner context", async () => {
    const app = createModelServer({
      prisma: new PrismaClient({ datasources: { db: { url: "file:./resolve-auth-test.db" } } }),
      resolver: async () => result,
      routeAccess: { secrets: { agent: "sec-agent" }, isProduction: false },
    });

    const response = await app.inject({
      method: "POST",
      url: "/resolve",
      payload: { requestId: "request-unauthenticated", label: "default" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("internal.unauthorized");
    await app.close();
  });

  it("uses the trusted tenant context and rejects body tenantId on the formal route", async () => {
    const app = createModelServer({
      prisma: new PrismaClient({ datasources: { db: { url: "file:./resolve-context-test.db" } } }),
      resolver: async (request) => ({ ...result, modelRevisionId: request.tenantId }),
      routeAccess: { secrets: { agent: "sec-agent" }, isProduction: false },
    });

    const missingContext = await app.inject({
      method: "POST",
      url: "/resolve",
      headers: { "x-kokoro-service": "agent", "x-kokoro-internal-secret": "sec-agent" },
      payload: { requestId: "request-body-tenant", label: "default" },
    });
    expect(missingContext.statusCode).toBe(400);
    expect(missingContext.json().error.code).toBe("model.tenant_required");

    const contextResponse = await app.inject({
      method: "POST",
      url: "/resolve",
      headers: {
        "x-kokoro-service": "agent",
        "x-kokoro-internal-secret": "sec-agent",
        "x-kokoro-tenant-id": result.providerId,
      },
      payload: { requestId: "request-context-tenant", label: "default" },
    });
    expect(contextResponse.statusCode).toBe(200);
    expect(contextResponse.json().data.modelRevisionId).toBe(result.providerId);

    const mismatchedBody = await app.inject({
      method: "POST",
      url: "/resolve",
      headers: {
        "x-kokoro-service": "agent",
        "x-kokoro-internal-secret": "sec-agent",
        "x-kokoro-tenant-id": result.providerId,
      },
      payload: { requestId: "request-mismatched-body", tenantId: result.modelRevisionId, label: "default" },
    });
    expect(mismatchedBody.statusCode).toBe(400);
    expect(mismatchedBody.json().error.code).toBe("request.invalid");
    await app.close();
  });

  it("exposes health and resolve over the local HTTP surface", async () => {
    const app = createTargetHttpServer(async () => result);
    const health = await app.inject({ method: "GET", url: "/healthz" });
    const response = await app.inject({
      method: "POST",
      url: "/resolve",
      headers: { "x-kokoro-tenant-id": result.modelRevisionId },
      payload: { requestId: "request-1", label: "default" },
    });
    expect(health.statusCode).toBe(200);
    expect(response.statusCode).toBe(200);
    expect(response.json().data.modelRevisionId).toBe(result.modelRevisionId);
    expect(response.json().data.routingPolicyGeneration).toBe("1");
    await app.close();
  });

  it("echoes request_id in validation, not-found, and dependency errors", async () => {
    const failing = createTargetHttpServer(async () => { throw new ModelDependencyError("redis unavailable"); });

    const invalid = await failing.inject({
      method: "POST",
      url: "/resolve",
      headers: { "x-kokoro-tenant-id": result.modelRevisionId },
      payload: { requestId: "request-invalid" },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ meta: { request_id: "request-invalid" }, error: { code: "request.invalid" } });

    const unavailable = await failing.inject({
      method: "POST",
      url: "/resolve",
      headers: { "x-kokoro-tenant-id": result.modelRevisionId },
      payload: { requestId: "request-unavailable", label: "default" },
    });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toMatchObject({
      meta: { request_id: "request-unavailable" },
      error: { code: "model.dependencies_unavailable" },
    });

    await failing.close();
  });

  it("returns request_id and a unified error for an unmatched route", async () => {
    const app = createTargetHttpServer(async () => null);
    const response = await app.inject({
      method: "POST",
      url: "/resolve",
      headers: { "x-kokoro-tenant-id": result.modelRevisionId },
      payload: { requestId: "request-missing", label: "missing" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ meta: { request_id: "request-missing" }, error: { code: "model.route_not_found" } });
    await app.close();
  });
});
