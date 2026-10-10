import { Router, type Request, type Response } from "express";
import { pgPool } from "../db/postgres.js";
import { parsePagination } from "../services/pagination.service.js";

export const postgresRouter = Router();

postgresRouter.get("/health", async (_req: Request, res: Response) => {
  try {
    const result = await pgPool.query("SELECT NOW() AS now");
    res.json({
      status: "ok",
      database: "postgresql",
      serverTime: result.rows[0].now,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(503).json({
      status: "error",
      database: "postgresql",
      message,
    });
  }
});

postgresRouter.get("/users", async (req: Request, res: Response) => {
  try {
    const { limit, offset } = parsePagination(req.query);

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const result = await pgPool.query(
      "SELECT id, name, email, created_at FROM users ORDER BY id ASC LIMIT $1 OFFSET $2",
      [limit, offset]
    );

    res.json({
      database: "postgresql",
      count: result.rowCount ?? 0,
      data: result.rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({
      status: "error",
      database: "postgresql",
      message,
    });
  }
});

postgresRouter.post("/users", async (req: Request, res: Response) => {
  try {
    const { name, email } = req.body as { name?: string; email?: string };

    if (!name || !email) {
      res.status(400).json({ message: "name and email are required" });
      return;
    }

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const result = await pgPool.query(
      `INSERT INTO users (name, email)
       VALUES ($1, $2)
       RETURNING id, name, email, created_at`,
      [name, email]
    );

    res.status(201).json({
      database: "postgresql",
      data: result.rows[0],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({
      status: "error",
      database: "postgresql",
      message,
    });
  }
});
