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
    collection: () => ({
      insertOne: mongoInsertOne,
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

    const res = await request(app)
      .post("/api/tasks")
      .send({
        title: "Estudiar GitHub Actions",
        description: "Completar la práctica de CI/CD",
      });

    expect(res.status).toBe(201);

    expect(res.body.data).toMatchObject({
      _id: "t1",
      title: "Estudiar GitHub Actions",
      description: "Completar la práctica de CI/CD",
      completed: false,
    });

    expect(mongoInsertOne).toHaveBeenCalledOnce();
  });

  it("POST /api/tasks sin título responde 400", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .send({ description: "Una tarea sin título" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: "title is required",
    });

    expect(mongoInsertOne).not.toHaveBeenCalled();
  });
});