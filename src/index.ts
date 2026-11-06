import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectPostgres, closePostgres } from "./db/postgres.js";
import { connectMongo, closeMongo } from "./db/mongo.js";
import { connectRedis, closeRedis } from "./db/redis.js";

async function bootstrap() {
  await connectPostgres();
  await connectMongo();
  await connectRedis();

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`Server running on http://localhost:${env.port}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down...`);
    server.close(async () => {
      await Promise.all([closePostgres(), closeMongo(), closeRedis()]);
      process.exit(0);
    });
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

bootstrap().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
