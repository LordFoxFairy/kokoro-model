import { createHash } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";
import { ModelTransport, type ResolveModelRequest } from "../../generated/proto/kokoro/model/v1/model_catalog_pb.js";
import type { ModelResolveResult } from "../../interfaces/rpc/service.js";

export interface QueryablePool {
  query<T extends QueryResultRow>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
}

interface RouteRow extends QueryResultRow {
  model_revision_id: string;
  provider_id: string;
  provider_model_name: string;
  routing_policy_id: string;
  routing_policy_generation: string | number;
  priority: number;
}

export class PostgresModelResolver {
  constructor(private readonly pool: QueryablePool) {}

  async resolve(request: Pick<ResolveModelRequest, "requestId" | "siteId" | "label">): Promise<ModelResolveResult | null> {
    const result = await this.pool.query<RouteRow>(
      `
        SELECT
          mr.model_revision_id,
          mp.provider_id,
          mr.provider_model_name,
          rp.routing_policy_id,
          rp.generation AS routing_policy_generation,
          rp.priority
        FROM kokoro.model_routing_policy rp
        JOIN kokoro.model_revision mr ON mr.model_revision_id = rp.model_revision_id
        JOIN kokoro.model_provider mp ON mp.provider_id = mr.provider_id
        LEFT JOIN kokoro.model_provider_health_state hs ON hs.provider_id = mp.provider_id
        WHERE rp.site_id = $1
          AND rp.label = $2
          AND rp.status = 'active'
          AND mr.published_at IS NOT NULL
          AND mr.transport = 'litellm'
          AND mp.status = 'active'
          AND COALESCE(hs.status, 'unknown') <> 'down'
        ORDER BY rp.priority ASC, mr.model_revision_id ASC
        LIMIT 1
      `,
      [request.siteId, request.label],
    );

    const row = result.rows[0];
    if (!row) return null;

    const digest = createHash("sha256")
      .update(JSON.stringify({
        requestId: request.requestId,
        modelRevisionId: row.model_revision_id,
        providerId: row.provider_id,
        routingPolicyId: row.routing_policy_id,
        generation: String(row.routing_policy_generation),
        priority: row.priority,
      }))
      .digest("hex");

    return {
      modelRevisionId: row.model_revision_id,
      providerId: row.provider_id,
      providerModelName: row.provider_model_name,
      transport: ModelTransport.LITELLM,
      routingPolicyId: row.routing_policy_id,
      routingPolicyGeneration: BigInt(row.routing_policy_generation),
      digest,
    };
  }
}

export async function closePostgresPool(pool: Pool): Promise<void> {
  await pool.end();
}
