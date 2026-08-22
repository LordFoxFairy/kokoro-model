import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const targetFiles = [
  "src/interfaces/http/target-main.ts", "src/interfaces/http/target-server.ts",
  "src/interfaces/rpc/main.ts", "src/interfaces/rpc/server.ts", "src/interfaces/rpc/service.ts",
  "src/infrastructure/mysql/model-resolver.ts", "src/infrastructure/redis/model-cache.ts",
];

describe("standalone target architecture", () => {
  it("keeps the release runtime on MySQL + Redis and generated RPC boundaries", async () => {
    const releaseSource = (await Promise.all(targetFiles.map((file) => readFile(file, "utf8")))).join("\n");
    expect(releaseSource).not.toMatch(/from ["'][^"']*postgres|from ["']pg["']/i);
    expect(releaseSource).not.toContain("@kokoro/platform-kit");
    expect(releaseSource).toContain("MySQLModelResolver");
    expect(releaseSource).toContain("RedisCachedModelResolver");
    expect(releaseSource).toContain("model_catalog_pb");
  });
});
