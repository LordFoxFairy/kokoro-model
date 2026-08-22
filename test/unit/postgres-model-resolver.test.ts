import { describe, expect, it } from "vitest";
import { ModelTransport } from "../../src/generated/proto/kokoro/model/v1/model_catalog_pb.js";
import { PostgresModelResolver, type QueryablePool } from "../../src/infrastructure/postgres/model-resolver.js";

describe("PostgresModelResolver", () => {
  it("resolves the stable published route and returns a digest", async () => {
    let values: readonly unknown[] | undefined;
    const pool: QueryablePool = {
      async query(_sql, queryValues) {
        values = queryValues;
        return {
          rows: [{
            model_revision_id: "revision-1",
            provider_id: "provider-1",
            provider_model_name: "gpt-test",
            routing_policy_id: "policy-1",
            routing_policy_generation: "7",
            priority: 10,
          }] as never,
        };
      },
    };

    const result = await new PostgresModelResolver(pool).resolve({
      requestId: "request-1",
      siteId: "site-1",
      label: "default",
    });

    expect(values).toEqual(["site-1", "default"]);
    expect(result).toMatchObject({
      modelRevisionId: "revision-1",
      providerId: "provider-1",
      providerModelName: "gpt-test",
      transport: ModelTransport.LITELLM,
      routingPolicyId: "policy-1",
      routingPolicyGeneration: 7n,
    });
    expect(result?.digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns null when no eligible route exists", async () => {
    const pool: QueryablePool = { async query() { return { rows: [] }; } };
    await expect(new PostgresModelResolver(pool).resolve({
      requestId: "request-1",
      siteId: "site-1",
      label: "missing",
    })).resolves.toBeNull();
  });
});
