import { Router, type Request, type Response } from "express";
import { pgPool } from "../db/postgres.js";

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

postgresRouter.get("/users", async (_req: Request, res: Response) => {
  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const result = await pgPool.query(
      "SELECT id, name, email, created_at FROM users ORDER BY id ASC"
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

postgresRouter.put("/users/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { name, email } = req.body as { name?: string; email?: string };

    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: "id must be a positive integer" });
      return;
    }

    if (!name && !email) {
      res.status(400).json({ message: "name or email is required" });
      return;
    }

    const result = await pgPool.query(
      `UPDATE users
       SET name = COALESCE($1, name), email = COALESCE($2, email)
       WHERE id = $3
       RETURNING id, name, email, created_at`,
      [name ?? null, email ?? null, id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.json({
      database: "postgresql",
      data: result.rows[0],
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ message: "email already exists" });
      return;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({
      status: "error",
      database: "postgresql",
      message,
    });
  }
});
