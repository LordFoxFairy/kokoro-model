import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const provenance = JSON.parse(readFileSync("contract/provenance.json", "utf8"));
for (const [relative, expected] of Object.entries(provenance.proto_sha256 ?? {})) {
  const actual = createHash("sha256").update(readFileSync(`contract/proto/${relative}`)).digest("hex");
  if (actual !== expected) throw new Error(`contract source drift: ${relative}`);
}
if (!provenance.root_commit) throw new Error("contract provenance has no root commit");
console.log(`contract provenance verified: ${provenance.root_commit}`);
