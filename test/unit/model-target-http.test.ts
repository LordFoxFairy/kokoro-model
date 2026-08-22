import { describe, expect, it } from "vitest";
import type { ModelResolveResult } from "../../src/interfaces/rpc/service.js";
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

describe("target MySQL + Redis HTTP boundary", () => {
  it("exposes health and resolve over the local HTTP surface", async () => {
    const app = createTargetHttpServer(async () => result);
    const health = await app.inject({ method: "GET", url: "/healthz" });
    const response = await app.inject({ method: "POST", url: "/resolve", payload: {
      requestId: "request-1", siteId: result.modelRevisionId, label: "default",
    } });
    expect(health.statusCode).toBe(200);
    expect(response.statusCode).toBe(200);
    expect(response.json().data.modelRevisionId).toBe(result.modelRevisionId);
    expect(response.json().data.routingPolicyGeneration).toBe("1");
    await app.close();
  });
});
