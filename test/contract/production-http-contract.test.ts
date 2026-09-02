import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../generated/prisma/index.js";
import { createModelServer } from "../../src/interfaces/http/server.js";

const prisma = new PrismaClient({ datasources: { db: { url: "file:./production-http-contract.db" } } });
const app = createModelServer({ prisma, resolver: async () => null, routeAccess: { secrets: {}, isProduction: false, insecureLocal: true } });

describe("production HTTP contract", () => {
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("documents the catalog and resolve routes on the same production surface", async () => {
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/docs/json" });
    expect(response.statusCode).toBe(200);

    const paths = response.json().paths as Record<string, Record<string, unknown>>;
    expect(paths["/bff/model-catalog"]?.get).toBeDefined();
    expect(paths["/resolve"]?.post).toBeDefined();
  });
});
