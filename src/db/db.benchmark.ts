import { createBench, ITERATIONS, type BenchResult } from "../bench-utils.js";
import { connectPostgres, pgPool } from "./postgres.js";
import { connectMongo, getMongoDb } from "./mongo.js";

export async function benchDb(): Promise<BenchResult> {
  const { measure, section, result } = createBench("db");
  const tag = `bench-${Date.now()}`;

  await section("postgres", async () => {
    await connectPostgres();
    await measure("postgres SELECT 1", ITERATIONS, () => pgPool.query("SELECT 1"));
    await pgPool.query(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await measure("postgres INSERT users", ITERATIONS, (i) =>
      pgPool.query("INSERT INTO users (name, email) VALUES ($1, $2)", ["Bench", `${tag}-${i}@bench.test`]),
    );
    await measure("postgres SELECT users LIMIT 10", ITERATIONS, () =>
      pgPool.query("SELECT id, name, email, created_at FROM users ORDER BY id ASC LIMIT 10 OFFSET 0"),
    );
    await pgPool.query("DELETE FROM users WHERE email LIKE $1", [`${tag}-%`]);
  });

  await section("mongo", async () => {
    await connectMongo();
    const db = getMongoDb();
    await measure("mongo ping", ITERATIONS, () => db.command({ ping: 1 }));
    await measure("mongo insertOne users", ITERATIONS, (i) =>
      db.collection("users").insertOne({ name: "Bench", email: `${tag}-${i}@bench.test`, createdAt: new Date() }),
    );
    await measure("mongo find users limit 10", ITERATIONS, () =>
      db.collection("users").find({}).project({ name: 1, email: 1, createdAt: 1 }).skip(0).limit(10).toArray(),
    );
    await db.collection("users").deleteMany({ email: { $regex: `^${tag}-` } });
  });

  return result;
}
