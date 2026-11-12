import "dotenv/config";

export const env = {
  port: Number(process.env.PORT) || 3000,
  postgres: {
    host: process.env.POSTGRES_HOST || "localhost",
    port: Number(process.env.POSTGRES_PORT) || 5432,
    user: process.env.POSTGRES_USER || "postgres",
    password: process.env.POSTGRES_PASSWORD || "postgres",
    database: process.env.POSTGRES_DB || "app_db",
  },
  mongo: {
    uri: process.env.MONGO_URI || "mongodb://localhost:27017",
    dbName: process.env.MONGO_DB || "app_db",
  },
  trace: {
    // Log JSON por petición; apagado por defecto en los tests para no ensuciar la salida.
    log: flag(process.env.TRACE_LOG, !process.env.VITEST),
    // Expone GET /api/traces; conviene apagarlo en producción.
    endpoint: flag(process.env.TRACE_ENDPOINT, true),
    bufferSize: Number(process.env.TRACE_BUFFER_SIZE) || 500,
    slowMs: Number(process.env.TRACE_SLOW_MS) || 200,
  },
};

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
