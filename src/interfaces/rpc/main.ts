import { createModelRpcServer } from "./server.js";
import { createPostgresPool } from "../../infrastructure/postgres/pg-client.js";
import { PostgresModelResolver } from "../../infrastructure/postgres/model-resolver.js";

const port = Number(process.env.KOKORO_MODEL_RPC_PORT ?? "4222");
const pool = createPostgresPool();
const resolver = new PostgresModelResolver(pool);
const server = createModelRpcServer((request) => resolver.resolve(request));

server.listen(port, "0.0.0.0", () => {
  console.log(`kokoro-model RPC listening on ${port}`);
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  server.close(async () => {
    await pool.end();
    console.log(`kokoro-model RPC stopped after ${signal}`);
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
