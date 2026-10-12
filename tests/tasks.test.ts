import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { mongoInsertOne } = vi.hoisted(() => ({
  mongoInsertOne: vi.fn(),
}));

vi.mock("../src/db/postgres.js", () => ({
  pgPool: { query: vi.fn() },
}));

vi.mock("../src/db/mongo.js", () => ({
  getMongoDb: () => ({
    collection: () => ({ insertOne: mongoInsertOne }),
  }),
}));

import { createApp } from "../src/app.js";

const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Tasks endpoints", () => {
  // Test 1: caso exitoso
  it("POST /api/tasks crea una tarea y responde 201", async () => {
    mongoInsertOne.mockResolvedValueOnce({ insertedId: "task123" });

    const res = await request(app)
      .post("/api/tasks")
      .send({ title: "Estudiar DevOps", priority: 1 });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      _id: "task123",
      title: "Estudiar DevOps",
      priority: 1,
    });
    expect(mongoInsertOne).toHaveBeenCalledOnce();
  });

  // Test 2: validacion
  it("POST /api/tasks sin prioridad responde 400", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .send({ title: "Estudiar DevOps" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: "title and a positive priority are required",
    });
    expect(mongoInsertOne).not.toHaveBeenCalled();
  });
});
