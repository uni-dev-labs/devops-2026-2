import { Router, type Request, type Response } from "express";
import { pgPool } from "../db/postgres.js";

export const tasksRouter = Router();

export const TASK_PRIORITIES = ["low", "medium", "high"] as const;
type TaskPriority = (typeof TASK_PRIORITIES)[number];

const CREATE_TASKS_TABLE = `
  CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium',
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

const TASK_COLUMNS = "id, title, priority, completed, created_at";

function errorResponse(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  res.status(500).json({ status: "error", database: "postgresql", message });
}

function parseId(raw: string | undefined): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// GET /api/tasks → lista las tareas
tasksRouter.get("/", async (_req: Request, res: Response) => {
  try {
    await pgPool.query(CREATE_TASKS_TABLE);
    const result = await pgPool.query(
      `SELECT ${TASK_COLUMNS} FROM tasks ORDER BY id ASC`
    );
    res.json({
      database: "postgresql",
      count: result.rowCount ?? 0,
      data: result.rows,
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// GET /api/tasks/:id → obtiene una tarea por id
tasksRouter.get("/:id", async (req: Request<{ id: string }>, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ message: "id must be a positive integer" });
    return;
  }

  try {
    await pgPool.query(CREATE_TASKS_TABLE);
    const result = await pgPool.query(
      `SELECT ${TASK_COLUMNS} FROM tasks WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ message: "task not found" });
      return;
    }
    res.json({ database: "postgresql", data: result.rows[0] });
  } catch (error) {
    errorResponse(res, error);
  }
});

// POST /api/tasks → crea una tarea { title, priority? }
tasksRouter.post("/", async (req: Request, res: Response) => {
  const { title, priority = "medium" } = (req.body ?? {}) as {
    title?: unknown;
    priority?: unknown;
  };

  if (typeof title !== "string" || title.trim().length === 0) {
    res.status(400).json({ message: "title is required" });
    return;
  }

  if (!TASK_PRIORITIES.includes(priority as TaskPriority)) {
    res
      .status(400)
      .json({ message: "priority must be one of: low, medium, high" });
    return;
  }

  try {
    await pgPool.query(CREATE_TASKS_TABLE);
    const result = await pgPool.query(
      `INSERT INTO tasks (title, priority)
       VALUES ($1, $2)
       RETURNING ${TASK_COLUMNS}`,
      [title.trim(), priority]
    );
    res.status(201).json({ database: "postgresql", data: result.rows[0] });
  } catch (error) {
    errorResponse(res, error);
  }
});

// PATCH /api/tasks/:id/complete → marca una tarea como completada
tasksRouter.patch(
  "/:id/complete",
  async (req: Request<{ id: string }>, res: Response) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ message: "id must be a positive integer" });
      return;
    }

    try {
      await pgPool.query(CREATE_TASKS_TABLE);
      const result = await pgPool.query(
        `UPDATE tasks SET completed = TRUE
         WHERE id = $1
         RETURNING ${TASK_COLUMNS}`,
        [id]
      );
      if (result.rows.length === 0) {
        res.status(404).json({ message: "task not found" });
        return;
      }
      res.json({ database: "postgresql", data: result.rows[0] });
    } catch (error) {
      errorResponse(res, error);
    }
  }
);
