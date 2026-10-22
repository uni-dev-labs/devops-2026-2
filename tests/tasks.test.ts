import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { pgQuery } = vi.hoisted(() => ({
  pgQuery: vi.fn(),
}));

vi.mock("../src/db/postgres.js", () => ({
  pgPool: { query: pgQuery },
}));

vi.mock("../src/db/mongo.js", () => ({
  getMongoDb: () => ({ collection: vi.fn() }),
}));

import { createApp } from "../src/app.js";
const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Tasks endpoints", () => {
  it("POST /api/tasks crea una tarea y responde 201", async () => {
    pgQuery.mockResolvedValueOnce({ rows: [] }); 
    pgQuery.mockResolvedValueOnce({ rows: [{ id: 1, title: "Estudiar Actions", done: false }] });

    const res = await request(app).post("/api/tasks").send({ title: "Estudiar Actions" });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ id: 1, title: "Estudiar Actions", done: false });
    expect(pgQuery).toHaveBeenCalledTimes(2);
  });

  it("POST /api/tasks sin título responde 400", async () => {
    const res = await request(app).post("/api/tasks").send({ title: "" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "title is required" });
    expect(pgQuery).not.toHaveBeenCalled();
  });
});