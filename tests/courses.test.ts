import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { pgQuery } = vi.hoisted(() => ({
  pgQuery: vi.fn(),
}));

vi.mock("../src/db/postgres.js", () => ({
  pgPool: { query: pgQuery },
}));

vi.mock("../src/db/mongo.js", () => ({
  getMongoDb: vi.fn(),
}));

import { createApp } from "../src/app.js";

const app = createApp();

const course = {
  id: 1,
  name: "DevOps",
  credits: 3,
  created_at: "2026-10-09T00:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("Courses endpoints", () => {
  it("GET /api/courses devuelve la lista de cursos", async () => {
    pgQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [course], rowCount: 1 });

    const res = await request(app).get("/api/courses");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ database: "postgresql", count: 1, data: [course] });
  });

  it("GET /api/courses responde 500 si la base de datos falla", async () => {
    pgQuery.mockRejectedValueOnce(new Error("connection refused"));

    const res = await request(app).get("/api/courses");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      status: "error",
      database: "postgresql",
      message: "connection refused",
    });
  });

  it("GET /api/courses/:id devuelve el curso solicitado", async () => {
    pgQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [course], rowCount: 1 });

    const res = await request(app).get("/api/courses/1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ database: "postgresql", data: course });
    expect(pgQuery).toHaveBeenLastCalledWith(expect.stringContaining("WHERE id = $1"), [1]);
  });

  it("GET /api/courses/:id responde 404 si el curso no existe", async () => {
    pgQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).get("/api/courses/99");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Course not found" });
  });

  it("GET /api/courses/:id con id inválido responde 400", async () => {
    const res = await request(app).get("/api/courses/abc");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "id must be a positive integer" });
    expect(pgQuery).not.toHaveBeenCalled();
  });

  it("POST /api/courses crea un curso y responde 201", async () => {
    pgQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [course], rowCount: 1 });

    const res = await request(app)
      .post("/api/courses")
      .send({ name: "  DevOps  ", credits: 3 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ database: "postgresql", data: course });
    expect(pgQuery).toHaveBeenLastCalledWith(
      expect.stringContaining("INSERT INTO courses"),
      ["DevOps", 3]
    );
  });

  it("POST /api/courses sin credits responde 400", async () => {
    const res = await request(app).post("/api/courses").send({ name: "DevOps" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "name and credits are required" });
    expect(pgQuery).not.toHaveBeenCalled();
  });

  it("POST /api/courses sin body responde 400", async () => {
    const res = await request(app).post("/api/courses");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "name and credits are required" });
    expect(pgQuery).not.toHaveBeenCalled();
  });

  it("POST /api/courses con credits inválidos responde 400", async () => {
    const res = await request(app)
      .post("/api/courses")
      .send({ name: "DevOps", credits: -2 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "credits must be a positive integer" });
    expect(pgQuery).not.toHaveBeenCalled();
  });
});
