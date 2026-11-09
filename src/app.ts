import express from "express";
import cors from "cors";
import { postgresRouter } from "./routes/postgres.routes.js";
import { mongoRouter } from "./routes/mongo.routes.js";
import { productsRouter } from "./routes/products.routes.js";
import { requestTrace } from "./observability/request-trace.middleware.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  // Después de express.json() y antes de los routers: abre la traza de cada petición.
  app.use(requestTrace());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "express-ts-api" });
  });

  app.use("/api/postgres", postgresRouter);
  app.use("/api/mongo", mongoRouter);
  app.use("/api/products", productsRouter);

  app.use((_req, res) => {
    res.status(404).json({ message: "Route not found", code: "NOT_FOUND" });
  });

  return app;
}
