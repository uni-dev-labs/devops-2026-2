import { createClient } from "redis";
import { env } from "../config/env.js";

let client: ReturnType<typeof createClient> | null = null;

export async function connectRedis(): Promise<void> {
  if (client?.isReady) return;

  client = createClient({ url: env.redis.url });
  client.on("error", (error) => console.error("Redis client error:", error));
  await client.connect();
  console.log("Redis connected");
}

export function getRedisClient(): ReturnType<typeof createClient> {
  if (!client?.isReady) {
    throw new Error("Redis is not connected. Call connectRedis() first.");
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client?.isOpen) {
    await client.quit();
    client = null;
  }
}
