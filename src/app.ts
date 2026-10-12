import express from "express";
import cors from "cors";
import { postgresRouter } from "./routes/postgres.routes.js";
import { mongoRouter } from "./routes/mongo.routes.js";
<<<<<<< HEAD
import { booksRouter } from "./routes/books.routes.js"; // ← nuevecito
=======
import { productsRouter } from "./routes/products.routes.js";
>>>>>>> origin/main

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "express-ts-api" });
  });

  app.use("/api/postgres", postgresRouter);
  app.use("/api/mongo", mongoRouter);
<<<<<<< HEAD
  app.use("/api/mongo", mongoRouter);
  app.use("/api/books", booksRouter); // ← nuevecito
=======
  app.use("/api/products", productsRouter);
>>>>>>> origin/main

  app.use((_req, res) => {
    res.status(404).json({ message: "Route not found" });
  });

  return app;
}