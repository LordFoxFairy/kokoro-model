import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { describe, expect, it } from "vitest";
import { ModelCatalogService, ModelTransport } from "../../src/generated/proto/kokoro/model/v1/model_catalog_pb.js";
import { createModelRpcServer } from "../../src/interfaces/rpc/server.js";

function listen(server: ReturnType<typeof createModelRpcServer>): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("missing RPC address"));
      resolve(address.port);
    });
  });
}

describe("generated Model RPC transport", () => {
  it("serves ResolveModel through Connect using generated messages", async () => {
    const server = createModelRpcServer(async () => ({
      modelRevisionId: "revision-1",
      providerId: "provider-1",
      providerModelName: "gpt-test",
      transport: ModelTransport.LITELLM,
      routingPolicyId: "policy-1",
      routingPolicyGeneration: 1n,
      digest: "digest-1",
    }));
    const port = await listen(server);
    try {
      const client = createClient(ModelCatalogService, createConnectTransport({
        baseUrl: `http://127.0.0.1:${port}`,
        httpVersion: "1.1",
      }));
      const response = await client.resolveModel({
        requestId: "request-1",
        siteId: "site-1",
        label: "default",
      });
      expect(response.modelRevisionId).toBe("revision-1");
      expect(response.routingPolicyGeneration).toBe(1n);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
