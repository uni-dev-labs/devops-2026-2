import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { mongoInsertOne, mongoFind } = vi.hoisted(() => ({
  mongoInsertOne: vi.fn(),
  mongoFind: vi.fn(),
}));

vi.mock("../src/db/postgres.js", () => ({
  pgPool: { query: vi.fn() },
}));

vi.mock("../src/db/mongo.js", () => ({
  getMongoDb: () => ({
    collection: () => ({
      insertOne: mongoInsertOne,
      find: () => ({ toArray: mongoFind }),
    }),
  }),
}));

import { createApp } from "../src/app.js";

const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Tasks endpoints", () => {
  it("POST /api/tasks crea una tarea y responde 201", async () => {
    mongoInsertOne.mockResolvedValueOnce({ insertedId: "t1" });

    const res = await request(app).post("/api/tasks").send({ title: "  Estudiar DevOps  " });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ _id: "t1", title: "Estudiar DevOps", done: false });
    expect(mongoInsertOne).toHaveBeenCalledOnce();
  });

  it("POST /api/tasks sin título responde 400", async () => {
    const res = await request(app).post("/api/tasks").send({ title: "   " });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "title is required" });
    expect(mongoInsertOne).not.toHaveBeenCalled();
  });

  it("GET /api/tasks devuelve la lista de tareas", async () => {
    const tasks = [{ _id: "t1", title: "Estudiar DevOps", done: false }];
    mongoFind.mockResolvedValueOnce(tasks);

    const res = await request(app).get("/api/tasks");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ database: "mongodb", count: 1, data: tasks });
  });
});
