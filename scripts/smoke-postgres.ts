import { createPostgresPool } from "../src/infrastructure/postgres/pg-client.js";
import { PostgresModelResolver } from "../src/infrastructure/postgres/model-resolver.js";

const pool = createPostgresPool();
const siteId = "00000000-0000-0000-0000-000000000001";
const providerId = "00000000-0000-0000-0000-000000000002";
const modelId = "00000000-0000-0000-0000-000000000003";
const revisionId = "00000000-0000-0000-0000-000000000004";
const policyId = "00000000-0000-0000-0000-000000000005";

try {
  await pool.query("BEGIN");
  await pool.query("INSERT INTO kokoro.site_site(site_id) VALUES ($1) ON CONFLICT DO NOTHING", [siteId]);
  await pool.query(
    `INSERT INTO kokoro.model_provider(provider_id, key, display_name, status, generation)
     VALUES ($1, 'smoke-provider', 'Smoke Provider', 'active', 1)
     ON CONFLICT (provider_id) DO NOTHING`,
    [providerId],
  );
  await pool.query(
    `INSERT INTO kokoro.model_definition(model_id, key, display_name, status, generation)
     VALUES ($1, 'smoke-model', 'Smoke Model', 'active', 1)
     ON CONFLICT (model_id) DO NOTHING`,
    [modelId],
  );
  await pool.query(
    `INSERT INTO kokoro.model_revision(
       model_revision_id, model_id, revision, provider_id, provider_model_name,
       transport, modalities, context_window, published_at
     ) VALUES ($1, $2, 1, $3, 'smoke-model-v1', 'litellm', '["text"]'::jsonb, 4096, now())
     ON CONFLICT (model_revision_id) DO NOTHING`,
    [revisionId, modelId, providerId],
  );
  await pool.query(
    `INSERT INTO kokoro.model_routing_policy(
       routing_policy_id, site_id, label, model_revision_id, priority, status, generation
     ) VALUES ($1, $2, 'default', $3, 10, 'active', 1)
     ON CONFLICT (routing_policy_id) DO NOTHING`,
    [policyId, siteId, revisionId],
  );
  await pool.query("COMMIT");

  const result = await new PostgresModelResolver(pool).resolve({
    requestId: "smoke-request",
    siteId,
    label: "default",
  });
  if (!result || result.modelRevisionId !== revisionId || result.routingPolicyId !== policyId) {
    throw new Error(`unexpected ResolveModel result: ${JSON.stringify(result)}`);
  }
  console.log("kokoro-model PostgreSQL ResolveModel smoke passed");
} catch (error) {
  await pool.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await pool.query(
    "DELETE FROM kokoro.model_routing_policy WHERE routing_policy_id = $1; DELETE FROM kokoro.model_revision WHERE model_revision_id = $2; DELETE FROM kokoro.model_definition WHERE model_id = $3; DELETE FROM kokoro.model_provider WHERE provider_id = $4; DELETE FROM kokoro.site_site WHERE site_id = $5",
    [policyId, revisionId, modelId, providerId, siteId],
  ).catch(() => undefined);
  await pool.end();
}
