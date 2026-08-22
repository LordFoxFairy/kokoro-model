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
  "src/infrastructure/mysql/model-resolver.ts",
  "src/infrastructure/redis/model-cache.ts",
  "src/interfaces/http/target-main.ts",
  "src/interfaces/rpc/main.ts",
  "docker-compose.yml",
];
const missing = required.filter((file) => !existsSync(file));
if (missing.length) throw new Error(`missing standalone artifacts: ${missing.join(", ")}`);
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
for (const script of ["dev", "start", "legacy:http", "contract:check", "db:migrate", "smoke:mysql", "smoke:redis", "smoke:rpc"]) {
  if (!packageJson.scripts?.[script]) throw new Error(`missing package script: ${script}`);
}
if (!readFileSync(".env.example", "utf8").includes("mysql://")) throw new Error("standalone env must point at MySQL");
if (!readFileSync(".env.example", "utf8").includes("KOKORO_REDIS_URL")) throw new Error("standalone env must include Redis");
console.log(`standalone artifacts verified: ${required.length}`);
