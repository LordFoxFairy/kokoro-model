import { cpSync, existsSync, rmSync } from "node:fs";

if (!existsSync("generated")) {
  throw new Error("generated Prisma client is missing; run pnpm db:generate first");
}
if (!existsSync("dist/packages/service-kit")) {
  throw new Error("compiled service-kit is missing; run the TypeScript build first");
}

rmSync("dist/generated", { recursive: true, force: true });
cpSync("generated", "dist/generated", { recursive: true });
rmSync("packages/service-kit/dist", { recursive: true, force: true });
cpSync("dist/packages/service-kit", "packages/service-kit/dist", { recursive: true });
