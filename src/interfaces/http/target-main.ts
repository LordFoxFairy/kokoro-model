import { createPostgresPool } from "../../infrastructure/postgres/pg-client.js";
import { PostgresModelResolver } from "../../infrastructure/postgres/model-resolver.js";
import { createTargetHttpServer } from "./target-server.js";

const port = Number(process.env.KOKORO_MODEL_HTTP_PORT ?? process.env.KOKORO_MODEL_PORT ?? "4221");
const pool = createPostgresPool();
const app = createTargetHttpServer(new PostgresModelResolver(pool));
await app.listen({ host: "0.0.0.0", port });
console.log(`kokoro-model HTTP listening on ${port}`);

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  await app.close();
  await pool.end();
  console.log(`kokoro-model HTTP stopped after ${signal}`);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
