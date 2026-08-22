import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const targetFiles = [
  "src/interfaces/http/target-main.ts",
  "src/interfaces/http/target-server.ts",
  "src/interfaces/rpc/main.ts",
  "src/interfaces/rpc/server.ts",
  "src/interfaces/rpc/service.ts",
  "src/infrastructure/postgres/model-resolver.ts",
  "src/infrastructure/postgres/pg-client.ts",
];

describe("standalone target architecture", () => {
  it("keeps the release runtime on PostgreSQL and generated RPC boundaries", async () => {
    const contents = await Promise.all(targetFiles.map((file) => readFile(file, "utf8")));
    const releaseSource = contents.join("\n");
    expect(releaseSource).not.toMatch(/from ["'][^"']*prisma/i);
    expect(releaseSource).not.toContain("@kokoro/platform-kit");
    expect(releaseSource).toContain("PostgresModelResolver");
    expect(releaseSource).toContain("model_catalog_pb");
  });
});
