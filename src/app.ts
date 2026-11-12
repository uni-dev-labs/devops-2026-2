import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { postgresRouter } from "./routes/postgres.routes.js";
import { mongoRouter } from "./routes/mongo.routes.js";
import { productsRouter } from "./routes/products.routes.js";
import { TraceStore } from "./observability/trace-store.js";
import { TRACE_HEADER, traceMiddleware } from "./observability/trace.middleware.js";
import { tracesRouter } from "./observability/traces.routes.js";

export type AppOptions = {
  traceStore?: TraceStore;
  traceLog?: boolean;
  traceEndpoint?: boolean;
};

export function createApp(options: AppOptions = {}) {
  const app = express();
  const traceStore = options.traceStore ?? new TraceStore(env.trace.bufferSize);

  // Primero la trazabilidad, para que mida todo lo que viene después (incluido el parseo del body).
  app.use(
    traceMiddleware({
      store: traceStore,
      log: options.traceLog ?? env.trace.log,
      slowMs: env.trace.slowMs,
    }),
  );
  // El navegador solo deja leer estos headers en peticiones cross-origin si se exponen.
  app.use(cors({ exposedHeaders: [TRACE_HEADER, "Server-Timing"] }));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "express-ts-api" });
  });

  app.use("/api/postgres", postgresRouter);
  app.use("/api/mongo", mongoRouter);
  app.use("/api/products", productsRouter);
  if (options.traceEndpoint ?? env.trace.endpoint) {
    app.use("/api/traces", tracesRouter(traceStore));
  }

  app.use((_req, res) => {
    res.status(404).json({ message: "Route not found", code: "NOT_FOUND" });
  });

  return app;
}
