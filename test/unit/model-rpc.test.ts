import { Code, ConnectError, type HandlerContext } from "@connectrpc/connect";
import { describe, expect, it } from "vitest";
import { ModelTransport } from "../../src/generated/proto/kokoro/model/v1/model_catalog_pb.js";
import { createModelCatalogService } from "../../src/interfaces/rpc/service.js";

const context = {} as HandlerContext;

describe("ModelCatalogService RPC adapter", () => {
  it("maps a resolved route to the generated response message", async () => {
    const service = createModelCatalogService(async (request) => ({
      modelRevisionId: `revision:${request.tenantId}:${request.label}`,
      providerId: "provider-1",
      providerModelName: "model-1",
      transport: ModelTransport.LITELLM,
      routingPolicyId: "policy-1",
      routingPolicyGeneration: 3n,
      digest: "digest-1",
    }));

    const response = await service.resolveModel({
      $typeName: "kokoro.model.v1.ResolveModelRequest",
      requestId: "request-1",
      tenantId: "site-1",
      label: "default",
    }, context);

    expect(response.modelRevisionId).toBe("revision:site-1:default");
    expect(response.routingPolicyGeneration).toBe(3n);
  });

  it("rejects incomplete requests before invoking the resolver", async () => {
    const service = createModelCatalogService(async () => {
      throw new Error("resolver should not run");
    });

    await expect(
      service.resolveModel({
        $typeName: "kokoro.model.v1.ResolveModelRequest",
        requestId: "",
        tenantId: "site-1",
        label: "default",
      }, context),
    ).rejects.toMatchObject({ code: Code.InvalidArgument });
  });

  it("returns NotFound when no route matches", async () => {
    const service = createModelCatalogService(async () => null);

    await expect(
      service.resolveModel({
        $typeName: "kokoro.model.v1.ResolveModelRequest",
        requestId: "request-1",
        tenantId: "site-1",
        label: "missing",
      }, context),
    ).rejects.toBeInstanceOf(ConnectError);
  });
});
