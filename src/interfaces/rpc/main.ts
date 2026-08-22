import { createModelRpcServer } from "./server.js";

const port = Number(process.env.KOKORO_MODEL_RPC_PORT ?? "4222");
const server = createModelRpcServer(async () => {
  // Transitional seam: the PostgreSQL-backed resolver is wired in the migration phase.
  // Keeping this explicit prevents an RPC route from silently returning legacy semantics.
  return null;
});

server.listen(port, "0.0.0.0", () => {
  console.log(`kokoro-model RPC listening on ${port}`);
});
