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
  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
  },
};
