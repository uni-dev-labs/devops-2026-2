import { performance } from "node:perf_hooks";
import { env } from "../config/env.js";
import { closeMongo, connectMongo } from "../db/mongo.js";
import { closePostgres, connectPostgres, pgPool } from "../db/postgres.js";
import { closeRedis, connectRedis, getRedisClient } from "../db/redis.js";

async function measure(label: string, operation: () => Promise<unknown>): Promise<boolean> {
  const start = performance.now();

  try {
    await operation();
    console.log(`[db-timing] ${label} | ${(performance.now() - start).toFixed(2)} ms`);
    return true;
  } catch (error) {
    const durationMs = (performance.now() - start).toFixed(2);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[db-timing] ${label} | ERROR after ${durationMs} ms | ${message}`);
    return false;
  }
}

async function main(): Promise<void> {
  let hasFailures = false;

  try {
    const postgresConnected = await measure("PostgreSQL connection", connectPostgres);
    if (postgresConnected) {
      hasFailures = !(await measure("PostgreSQL SELECT 1", async () => {
        await pgPool.query("SELECT 1");
      })) || hasFailures;
    } else {
      hasFailures = true;
    }

    const mongoConnected = await measure("MongoDB connection", async () => {
      await connectMongo();
    });
    if (mongoConnected) {
      hasFailures = !(await measure("MongoDB ping", async () => {
        await (await connectMongo()).command({ ping: 1 });
      })) || hasFailures;
    } else {
      hasFailures = true;
    }

    const redisConnected = await measure("Redis connection", connectRedis);
    if (redisConnected) {
      hasFailures = !(await measure("Redis ping", async () => {
        await getRedisClient().ping();
      })) || hasFailures;
    } else {
      hasFailures = true;
    }

    console.log(`Redis URL: ${new URL(env.redis.url).host}`);
  } finally {
    const cleanupResults = await Promise.allSettled([
      closePostgres(),
      closeMongo(),
      closeRedis(),
    ]);

    cleanupResults.forEach((result, index) => {
      if (result.status === "rejected") {
        hasFailures = true;
        const services = ["PostgreSQL", "MongoDB", "Redis"];
        const message = result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
        console.error(`[db-timing] ${services[index]} cleanup | ERROR | ${message}`);
      }
    });
  }

  if (hasFailures) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("[db-timing] Benchmark failed:", error);
  process.exitCode = 1;
});
