import { existsSync, readFileSync } from "node:fs";

const required = [
  "README.md",
  "docs/DESIGN_CARD.md",
  "docs/TECHNICAL_DESIGN.md",
  "docs/OWNER_AND_MIGRATION.md",
  "docs/COMPATIBILITY.md",
  "contract/provenance.json",
  "src/catalog/README.md",
  "src/routing/README.md",
  "src/policies/README.md",
  "src/health/README.md",
  "src/adapters/README.md",
  "package.json",
  "pnpm-lock.yaml",
  ".github/workflows/ci.yml",
  "contract/buf.yaml",
  "contract/buf.gen.yaml",
  "src/generated/proto/kokoro/model/v1/model_catalog_pb.ts",
  "src/infrastructure/postgresql/model-resolver.ts",
  "src/infrastructure/redis/model-cache.ts",
  "src/interfaces/http/target-main.ts",
  "src/interfaces/rpc/main.ts",
  "docker-compose.yml",
  "database/60-model.postgresql.sql",
];
const missing = required.filter((file) => !existsSync(file));
if (missing.length) throw new Error(`missing standalone artifacts: ${missing.join(", ")}`);
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
for (const script of ["dev", "start", "contract:check", "db:migrate", "smoke:postgresql", "smoke:redis", "smoke:rpc"]) {
  if (!packageJson.scripts?.[script]) throw new Error(`missing package script: ${script}`);
}
if (!readFileSync(".env.example", "utf8").includes("postgresql://")) throw new Error("standalone env must point at PostgreSQL");
if (!readFileSync(".env.example", "utf8").includes("KOKORO_REDIS_URL")) throw new Error("standalone env must include Redis");
const prismaSchema = readFileSync("prisma/schema.prisma", "utf8");
for (const table of ["model_provider", "model_definition", "model_revision", "model_label", "model_routing_policy", "model_provider_health_state"]) {
  if (!prismaSchema.includes(`@@map(\"${table}\")`)) throw new Error(`Prisma schema missing canonical table: ${table}`);
}
for (const oldTable of ["model_provider_accounts", "model_bindings", "model_labels", "model_site_policies"]) {
  if (prismaSchema.includes(oldTable)) throw new Error(`legacy table remains in Prisma schema: ${oldTable}`);
}
console.log(`standalone artifacts verified: ${required.length}`);
