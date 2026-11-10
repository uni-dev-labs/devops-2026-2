import { Pool } from "pg";
import { env } from "../config/env.js";

export const pgPool = new Pool({
  host: env.postgres.host,
  port: env.postgres.port,
  user: env.postgres.user,
  password: env.postgres.password,
  database: env.postgres.database,
  ssl: env.postgres.ssl ? { rejectUnauthorized: false } : undefined,
});

export async function connectPostgres(): Promise<void> {
  const client = await pgPool.connect();
  try {
    await client.query("SELECT 1");
    console.log("PostgreSQL connected");
  } finally {
    client.release();
  }
}

export async function closePostgres(): Promise<void> {
  await pgPool.end();
}
