import { Router, type Request, type Response } from "express";
import { pgPool } from "../db/postgres.js";
import { parsePagination } from "../services/pagination.service.js";
import { withSpan } from "../observability/tracer.js";

export const postgresRouter = Router();

const CREATE_USERS_TABLE = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

// La trazabilidad mostró que este CREATE TABLE IF NOT EXISTS corría en *cada* petición y se
// llevaba casi la mitad del tiempo de servidor de /users (ver RENDIMIENTO.md). Ahora se ejecuta
// una sola vez por proceso; si falla, se olvida la promesa para reintentar en la siguiente petición.
let usersTableReady: Promise<unknown> | null = null;

function ensureUsersTable(): Promise<unknown> {
  if (!usersTableReady) {
    usersTableReady = withSpan("pg.ensureUsersTable", () => pgPool.query(CREATE_USERS_TABLE)).catch(
      (error: unknown) => {
        usersTableReady = null;
        throw error;
      },
    );
  }
  return usersTableReady;
}

/** Solo para tests: vuelve a exigir el CREATE TABLE en la siguiente petición. */
export function resetUsersTableCache(): void {
  usersTableReady = null;
}

postgresRouter.get("/health", async (_req: Request, res: Response) => {
  try {
    const result = await withSpan("pg.ping", () => pgPool.query("SELECT NOW() AS now"));
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
    const { limit, offset } = withSpan("pagination.parse", () => parsePagination(req.query));

    await ensureUsersTable();

    const result = await withSpan("pg.selectUsers", () =>
      pgPool.query(
        "SELECT id, name, email, created_at FROM users ORDER BY id ASC LIMIT $1 OFFSET $2",
        [limit, offset],
      ),
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

    await ensureUsersTable();

    const result = await withSpan("pg.insertUser", () =>
      pgPool.query(
        `INSERT INTO users (name, email)
         VALUES ($1, $2)
         RETURNING id, name, email, created_at`,
        [name, email],
      ),
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
