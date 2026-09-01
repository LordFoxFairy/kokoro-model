import { describe, expect, it } from "vitest";
import type { ModelResolveResult } from "../../src/interfaces/rpc/service.js";
import { ModelDependencyError } from "../../src/domain/model-lifecycle.js";
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
  it("exposes health and resolve over the local HTTP surface", async () => {
    const app = createTargetHttpServer(async () => result);
    const health = await app.inject({ method: "GET", url: "/healthz" });
    const response = await app.inject({ method: "POST", url: "/resolve", payload: {
      requestId: "request-1", tenantId: result.modelRevisionId, label: "default",
    } });
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
      payload: { requestId: "request-invalid", tenantId: result.modelRevisionId },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ requestId: "request-invalid", error: { code: "request.invalid" } });

    const unavailable = await failing.inject({
      method: "POST",
      url: "/resolve",
      payload: { requestId: "request-unavailable", tenantId: result.modelRevisionId, label: "default" },
    });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toMatchObject({
      requestId: "request-unavailable",
      error: { code: "model.dependencies_unavailable" },
    });

    await failing.close();
  });

  it("returns request_id and a unified error for an unmatched route", async () => {
    const app = createTargetHttpServer(async () => null);
    const response = await app.inject({
      method: "POST",
      url: "/resolve",
      payload: { requestId: "request-missing", tenantId: result.modelRevisionId, label: "missing" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ requestId: "request-missing", error: { code: "model.route_not_found" } });
    await app.close();
  });
});
