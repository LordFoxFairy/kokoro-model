import { create } from "@bufbuild/protobuf";
import type { ServiceImpl } from "@connectrpc/connect";
import { ConnectError, Code } from "@connectrpc/connect";
import {
  ModelCatalogService,
  ModelTransport,
  type ResolveModelRequest,
  ResolveModelResponseSchema,
  type ResolveModelResponse,
} from "../../generated/proto/kokoro/model/v1/model_catalog_pb.js";
import { isModelDependencyError } from "../../domain/model-lifecycle.js";

export interface ModelResolveResult {
  modelRevisionId: string;
  providerId: string;
  providerModelName: string;
  transport: ModelTransport;
  routingPolicyId: string;
  routingPolicyGeneration: bigint;
  digest: string;
}

export type ModelResolver = (request: {
  requestId: string;
  tenantId: string;
  label: string;
}) => Promise<ModelResolveResult | null>;

export function createModelCatalogService(
  resolve: ModelResolver,
): ServiceImpl<typeof ModelCatalogService> {
  return {
    async resolveModel(request: ResolveModelRequest): Promise<ResolveModelResponse> {
      if (!request.requestId || !request.tenantId || !request.label) {
        throw new ConnectError("request_id, tenant_id and label are required", Code.InvalidArgument);
      }
      let result: ModelResolveResult | null;
      try {
        result = await resolve({
          requestId: request.requestId,
          tenantId: request.tenantId,
          label: request.label,
        });
      } catch (error) {
        if (isModelDependencyError(error)) {
          throw new ConnectError("model dependencies are unavailable", Code.Unavailable);
        }
        throw new ConnectError("model resolution failed", Code.Internal);
      }
      if (result === null) {
        throw new ConnectError("no model route matched", Code.NotFound);
      }
      return create(ResolveModelResponseSchema, {
        modelRevisionId: result.modelRevisionId,
        providerId: result.providerId,
        providerModelName: result.providerModelName,
        transport: result.transport,
        routingPolicyId: result.routingPolicyId,
        routingPolicyGeneration: result.routingPolicyGeneration,
        digest: result.digest,
      });
    },
  };
}
