import { Router, type Request, type Response } from "express";
import { pgPool } from "../db/postgres.js";

export const tasksRouter = Router();

tasksRouter.get("/", async (_req: Request, res: Response) => {
  try {
    await pgPool.query(
      "CREATE TABLE IF NOT EXISTS tasks (id SERIAL PRIMARY KEY, title VARCHAR(100) NOT NULL, done BOOLEAN DEFAULT FALSE);"
    );
    const result = await pgPool.query("SELECT * FROM tasks ORDER BY id DESC");
    res.json({ database: "postgres", count: result.rows.length, data: result.rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ status: "error", database: "postgres", message });
  }
});

tasksRouter.post("/", async (req: Request, res: Response) => {
  const { title } = req.body as { title?: string };

  if (!title || title.trim() === "") {
    res.status(400).json({ message: "title is required" });
    return;
  }

  try {
    await pgPool.query(
      "CREATE TABLE IF NOT EXISTS tasks (id SERIAL PRIMARY KEY, title VARCHAR(100) NOT NULL, done BOOLEAN DEFAULT FALSE);"
    );
    const result = await pgPool.query(
      "INSERT INTO tasks (title) VALUES ($1) RETURNING *",
      [title]
    );
    res.status(201).json({ database: "postgres", data: result.rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ status: "error", database: "postgres", message });
  }
});