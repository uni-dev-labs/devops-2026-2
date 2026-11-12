import express from "express";
import cors from "cors";
import { postgresRouter } from "./routes/postgres.routes.js";
import { mongoRouter } from "./routes/mongo.routes.js";
import { productsRouter } from "./routes/products.routes.js";
import {
  reiniciarTrazabilidad,
  resumenTrazabilidad,
  trazabilidad,
} from "./middlewares/trazabilidad.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(trazabilidad);

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "express-ts-api" });
  });

  // Resumen de tiempos por servicio + cálculo general
  app.get("/api/trazabilidad", (_req, res) => {
    res.json(resumenTrazabilidad());
  });

  app.delete("/api/trazabilidad", (_req, res) => {
    reiniciarTrazabilidad();
    res.status(204).end();
  });

  app.use("/api/postgres", postgresRouter);
  app.use("/api/mongo", mongoRouter);
  app.use("/api/products", productsRouter);

  app.use((_req, res) => {
    res.status(404).json({ message: "Route not found", code: "NOT_FOUND" });
  });

  return app;
}
