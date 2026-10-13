import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { pgQuery } = vi.hoisted(() => ({
  pgQuery: vi.fn(),
}));

vi.mock("../src/db/postgres.js", () => ({
  pgPool: { query: pgQuery },
}));

vi.mock("../src/db/mongo.js", () => ({
  getMongoDb: () => ({
    collection: () => ({ insertOne: vi.fn() }),
  }),
}));

import { createApp } from "../src/app.js";

const app = createApp();

const sampleTask = {
  id: 1,
  title: "Configurar pipeline de CI",
  priority: "high",
  completed: false,
  created_at: "2026-10-12T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Tasks endpoints (PostgreSQL)", () => {
  describe("GET /api/tasks", () => {
    it("devuelve la lista de tareas con su conteo", async () => {
      // Arrange: 1ª query = CREATE TABLE, 2ª query = SELECT
      pgQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [sampleTask], rowCount: 1 });

      // Act
      const res = await request(app).get("/api/tasks");

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        database: "postgresql",
        count: 1,
        data: [sampleTask],
      });
      expect(pgQuery).toHaveBeenCalledTimes(2);
    });

    it("responde 500 si la base de datos falla", async () => {
      pgQuery.mockRejectedValueOnce(new Error("connection refused"));

      const res = await request(app).get("/api/tasks");

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        status: "error",
        database: "postgresql",
        message: "connection refused",
      });
    });
  });

  describe("GET /api/tasks/:id", () => {
    it("devuelve la tarea cuando existe", async () => {
      pgQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [sampleTask], rowCount: 1 });

      const res = await request(app).get("/api/tasks/1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ database: "postgresql", data: sampleTask });
      expect(pgQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("WHERE id = $1"),
        [1]
      );
    });

    it("responde 404 cuando la tarea no existe", async () => {
      pgQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const res = await request(app).get("/api/tasks/999");

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: "task not found" });
    });

    it("responde 400 con un id inválido sin consultar la base de datos", async () => {
      const res = await request(app).get("/api/tasks/abc");

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: "id must be a positive integer" });
      expect(pgQuery).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/tasks", () => {
    it("crea una tarea y responde 201", async () => {
      pgQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [sampleTask], rowCount: 1 });

      const res = await request(app)
        .post("/api/tasks")
        .send({ title: "  Configurar pipeline de CI  ", priority: "high" });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ database: "postgresql", data: sampleTask });
      // El título se guarda sin espacios sobrantes y con parámetros ($1, $2)
      expect(pgQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("INSERT INTO tasks"),
        ["Configurar pipeline de CI", "high"]
      );
    });

    it("usa prioridad 'medium' por defecto", async () => {
      pgQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [{ ...sampleTask, priority: "medium" }],
          rowCount: 1,
        });

      const res = await request(app)
        .post("/api/tasks")
        .send({ title: "Escribir tests" });

      expect(res.status).toBe(201);
      expect(pgQuery).toHaveBeenLastCalledWith(expect.any(String), [
        "Escribir tests",
        "medium",
      ]);
    });

    it("responde 400 si falta el título", async () => {
      const res = await request(app).post("/api/tasks").send({ priority: "low" });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: "title is required" });
      expect(pgQuery).not.toHaveBeenCalled();
    });

    it("responde 400 si la prioridad no es válida", async () => {
      const res = await request(app)
        .post("/api/tasks")
        .send({ title: "Tarea", priority: "urgent" });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        message: "priority must be one of: low, medium, high",
      });
      expect(pgQuery).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/tasks/:id/complete", () => {
    it("marca la tarea como completada", async () => {
      const completed = { ...sampleTask, completed: true };
      pgQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [completed], rowCount: 1 });

      const res = await request(app).patch("/api/tasks/1/complete");

      expect(res.status).toBe(200);
      expect(res.body.data.completed).toBe(true);
    });

    it("responde 404 si la tarea a completar no existe", async () => {
      pgQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const res = await request(app).patch("/api/tasks/42/complete");

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: "task not found" });
    });
  });
});
