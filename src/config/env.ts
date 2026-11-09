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
  tracing: {
    // Trazabilidad de tiempos. Activa por defecto, salvo en tests (NODE_ENV=test) para no
    // ensuciar la salida. TRACE_TIMING=true|false fuerza el valor.
    enabled: process.env.TRACE_TIMING
      ? process.env.TRACE_TIMING === "true"
      : process.env.NODE_ENV !== "test",
  },
};
