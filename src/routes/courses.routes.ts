import { Router, type Request, type Response } from "express";
import { pgPool } from "../db/postgres.js";

export const coursesRouter = Router();

async function ensureCoursesTable(): Promise<void> {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS courses (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      credits INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

coursesRouter.get("/", async (_req: Request, res: Response) => {
  try {
    await ensureCoursesTable();

    const result = await pgPool.query(
      "SELECT id, name, credits, created_at FROM courses ORDER BY id ASC"
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

coursesRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: "id must be a positive integer" });
      return;
    }

    await ensureCoursesTable();

    const result = await pgPool.query(
      "SELECT id, name, credits, created_at FROM courses WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ message: "Course not found" });
      return;
    }

    res.json({
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

coursesRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { name, credits } = (req.body ?? {}) as {
      name?: unknown;
      credits?: unknown;
    };

    if (typeof name !== "string" || !name.trim() || credits === undefined) {
      res.status(400).json({ message: "name and credits are required" });
      return;
    }

    if (typeof credits !== "number" || !Number.isInteger(credits) || credits <= 0) {
      res.status(400).json({ message: "credits must be a positive integer" });
      return;
    }

    await ensureCoursesTable();

    const result = await pgPool.query(
      `INSERT INTO courses (name, credits)
       VALUES ($1, $2)
       RETURNING id, name, credits, created_at`,
      [name.trim(), credits]
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
