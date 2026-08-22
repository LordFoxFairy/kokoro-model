import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { createPostgresPool } from "../src/infrastructure/postgres/pg-client.js";
import { PostgresModelResolver } from "../src/infrastructure/postgres/model-resolver.js";
import { ModelCatalogService } from "../src/generated/proto/kokoro/model/v1/model_catalog_pb.js";
import { createModelRpcServer } from "../src/interfaces/rpc/server.js";

const ids = {
  site: "00000000-0000-0000-0000-000000000011",
  provider: "00000000-0000-0000-0000-000000000012",
  model: "00000000-0000-0000-0000-000000000013",
  revision: "00000000-0000-0000-0000-000000000014",
  policy: "00000000-0000-0000-0000-000000000015",
};
const pool = createPostgresPool();
const resolver = new PostgresModelResolver(pool);
const server = createModelRpcServer((request) => resolver.resolve(request));

try {
  await pool.query("BEGIN");
  await pool.query("INSERT INTO kokoro.site_site(site_id) VALUES ($1) ON CONFLICT DO NOTHING", [ids.site]);
  await pool.query("INSERT INTO kokoro.model_provider(provider_id,key,display_name,status,generation) VALUES ($1,'rpc-provider','RPC Provider','active',1) ON CONFLICT DO NOTHING", [ids.provider]);
  await pool.query("INSERT INTO kokoro.model_definition(model_id,key,display_name,status,generation) VALUES ($1,'rpc-model','RPC Model','active',1) ON CONFLICT DO NOTHING", [ids.model]);
  await pool.query("INSERT INTO kokoro.model_revision(model_revision_id,model_id,revision,provider_id,provider_model_name,transport,modalities,context_window,published_at) VALUES ($1,$2,1,$3,'rpc-model-v1','litellm',$4::jsonb,4096,now()) ON CONFLICT DO NOTHING", [ids.revision, ids.model, ids.provider, '["text"]']);
  await pool.query("INSERT INTO kokoro.model_routing_policy(routing_policy_id,site_id,label,model_revision_id,priority,status,generation) VALUES ($1,$2,'default',$3,1,'active',1) ON CONFLICT DO NOTHING", [ids.policy, ids.site, ids.revision]);
  await pool.query("COMMIT");

  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => resolve()); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("RPC server did not bind");
  const client = createClient(ModelCatalogService, createConnectTransport({ baseUrl: `http://127.0.0.1:${address.port}`, httpVersion: "1.1" }));
  const response = await client.resolveModel({ requestId: "rpc-smoke", siteId: ids.site, label: "default" });
  if (response.modelRevisionId !== ids.revision || response.routingPolicyId !== ids.policy) throw new Error("RPC smoke returned an unexpected route");
  console.log("kokoro-model PostgreSQL + generated RPC smoke passed");
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve())).catch(() => undefined);
  await pool.query("DELETE FROM kokoro.model_routing_policy WHERE routing_policy_id=$1; DELETE FROM kokoro.model_revision WHERE model_revision_id=$2; DELETE FROM kokoro.model_definition WHERE model_id=$3; DELETE FROM kokoro.model_provider WHERE provider_id=$4; DELETE FROM kokoro.site_site WHERE site_id=$5", [ids.policy, ids.revision, ids.model, ids.provider, ids.site]).catch(() => undefined);
  await pool.end();
}
