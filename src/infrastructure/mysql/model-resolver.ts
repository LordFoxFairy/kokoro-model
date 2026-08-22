import { createHash } from "node:crypto";
import { ModelTransport, type ResolveModelRequest } from "../../generated/proto/kokoro/model/v1/model_catalog_pb.js";
import type { ModelResolveResult } from "../../interfaces/rpc/service.js";
import { PrismaModelRepository } from "../prisma/prisma-model-repository.js";
import type { PrismaClient } from "../../../generated/prisma/index.js";

/** MySQL-backed compatibility resolver. The repository owns all model facts. */
export class MySQLModelResolver {
  private readonly repository: PrismaModelRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.repository = new PrismaModelRepository(prisma);
  }

  async resolve(request: Pick<ResolveModelRequest, "requestId" | "siteId" | "label">): Promise<ModelResolveResult | null> {
    const bindings = await this.repository.resolveModelBindings({
      featureKey: request.label,
      labelKey: request.label,
      siteId: request.siteId,
    });
    const binding = bindings[0];
    if (!binding) return null;

    const transport = binding.transportKind === "litellm" ? ModelTransport.LITELLM : ModelTransport.UNSPECIFIED;
    const generation = BigInt(1);
    const providerModelName = binding.gatewayModelName ?? binding.modelName;
    const digest = createHash("sha256").update(JSON.stringify({
      requestId: request.requestId,
      bindingId: binding.id,
      providerId: binding.providerAccountId,
      providerModelName,
      transport: binding.transportKind,
      generation: generation.toString(),
      priority: binding.priority,
    })).digest("hex");

    return {
      modelRevisionId: binding.id,
      providerId: binding.providerAccountId,
      providerModelName,
      transport,
      routingPolicyId: `legacy-binding:${binding.id}`,
      routingPolicyGeneration: generation,
      digest,
    };
  }
}

export async function checkMySQL(prisma: PrismaClient): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
