import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectPostgres, closePostgres } from "./db/postgres.js";
import { connectMongo, closeMongo } from "./db/mongo.js";
import { performance } from "node:perf_hooks";
import { round } from "./observability/tracer.js";

// Mide cuánto tarda cada fase del arranque (desde que Node empezó a ejecutar el proceso).
async function phase<T>(phases: Record<string, number>, name: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    phases[name] = round(performance.now() - start);
  }
}

async function bootstrap() {
  const phases: Record<string, number> = {};
  await phase(phases, "connectPostgres", connectPostgres);
  await phase(phases, "connectMongo", connectMongo);

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`Server running on http://localhost:${env.port}`);
    console.log(
      JSON.stringify({
        level: "info",
        msg: "startup",
        // performance.now() cuenta desde el inicio del proceso: incluye cargar módulos.
        readyMs: round(performance.now()),
        phasesMs: phases,
      }),
    );
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down...`);
    server.close(async () => {
      await Promise.all([closePostgres(), closeMongo()]);
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
