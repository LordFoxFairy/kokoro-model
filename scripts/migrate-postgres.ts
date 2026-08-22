import { readFile } from "node:fs/promises";
import { createPostgresPool } from "../src/infrastructure/postgres/pg-client.js";

const pool = createPostgresPool();
const version = "60-model";
try {
  await pool.query("CREATE SCHEMA IF NOT EXISTS kokoro");
  await pool.query("CREATE TABLE IF NOT EXISTS kokoro.schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const applied = await pool.query<{ version: string }>("SELECT version FROM kokoro.schema_migrations WHERE version = $1", [version]);
  if (applied.rows.length > 0) {
    console.log(`kokoro-model PostgreSQL schema already applied: ${version}`);
  } else {
    if (process.env.MODEL_DB_LOCAL === "1") {
      await pool.query(await readFile(new URL("../database/local/000-prerequisites.sql", import.meta.url), "utf8"));
    }
    const existing = await pool.query<{ exists: boolean }>("SELECT to_regclass('kokoro.model_provider') IS NOT NULL AS exists");
    if (!existing.rows[0]?.exists) {
      await pool.query(await readFile(new URL("../database/60-model.sql", import.meta.url), "utf8"));
    }
    await pool.query("INSERT INTO kokoro.schema_migrations(version) VALUES ($1)", [version]);
    console.log(`kokoro-model PostgreSQL schema applied: ${version}`);
  }
} finally {
  await pool.end();
}
