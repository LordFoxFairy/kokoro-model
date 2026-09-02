import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(import.meta.dirname, "../..");

async function read(relativePath: string): Promise<string> {
  return readFile(resolve(sourceRoot, relativePath), "utf8");
}

describe("model backend architecture", () => {
  it("keeps domain and application layers independent from adapters", async () => {
    const domainFiles = ["src/domain/enums.ts", "src/domain/errors.ts", "src/domain/models.ts"];
    const applicationFiles = ["src/application/dto.ts", "src/application/ports.ts", "src/application/model-service.ts"];
    const domainAndApplication = await Promise.all([...domainFiles, ...applicationFiles].map(read));
    const source = domainAndApplication.join("\n");

    expect(source).not.toMatch(/from ["'][^"']*\/infrastructure\//);
    expect(source).not.toMatch(/from ["'][^"']*\/interfaces\//);
    expect(source).not.toMatch(/from ["'](?:node:)?(?:fs|net|http|https|ioredis|fastify|@prisma)\b/);
  });

  it("keeps PostgreSQL and Redis concerns behind infrastructure adapters", async () => {
    const infrastructure = await Promise.all([
      read("src/infrastructure/prisma/prisma-model-repository.ts"),
      read("src/infrastructure/redis/model-cache.ts"),
      read("src/infrastructure/postgresql/model-resolver.ts"),
    ]);
    const source = infrastructure.join("\n");

    expect(source).toContain("PrismaModelRepository");
    expect(source).toContain("RedisCachedModelResolver");
    expect(source).toContain("PostgreSQLModelResolver");
    expect(source).toMatch(/from ["'][^"']*\/domain\/(?:enums|errors|models)\.js["']/);
  });
});
