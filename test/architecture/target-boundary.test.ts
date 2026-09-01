import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const targetFiles = [
  "src/interfaces/http/target-main.ts", "src/interfaces/http/target-server.ts",
  "src/interfaces/rpc/main.ts", "src/interfaces/rpc/server.ts", "src/interfaces/rpc/service.ts",
  "src/infrastructure/postgresql/model-resolver.ts", "src/infrastructure/redis/model-cache.ts",
];

describe("standalone target architecture", () => {
  it("keeps the release runtime on PostgreSQL + Redis and generated RPC boundaries", async () => {
    const releaseSource = (await Promise.all(targetFiles.map((file) => readFile(file, "utf8")))).join("\n");
    expect(releaseSource).not.toMatch(/from ["'][^"']*(?:node-postgres|pg(?:-promise)?)["']/i);
    expect(releaseSource).not.toContain("@kokoro/service-kit");
    expect(releaseSource).toContain("PostgreSQLModelResolver");
    expect(releaseSource).toContain("RedisCachedModelResolver");
    expect(releaseSource).toContain("model_catalog_pb");
  });
});
