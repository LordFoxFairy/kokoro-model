import { Pool } from "pg";

export function createPostgresPool(connectionString = process.env.DATABASE_URL_MODEL): Pool {
  if (!connectionString) {
    throw new Error("DATABASE_URL_MODEL is required for the PostgreSQL Model runtime");
  }
  if (!connectionString.startsWith("postgres://") && !connectionString.startsWith("postgresql://")) {
    throw new Error("DATABASE_URL_MODEL must be a PostgreSQL connection string");
  }
  return new Pool({ connectionString, max: Number(process.env.MODEL_DB_POOL_SIZE ?? "10") });
}
