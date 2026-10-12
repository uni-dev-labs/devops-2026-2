import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { pgQuery, mongoInsertOne } = vi.hoisted(() => ({
  pgQuery: vi.fn(),
  mongoInsertOne: vi.fn(),
}));

vi.mock("../src/db/postgres.js", () => ({
  pgPool: { query: pgQuery },
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

describe("API endpoints", () => {
  it("GET /health responde ok", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "express-ts-api" });
  });

  it("GET /api/postgres/users devuelve la lista de usuarios", async () => {
    const users = [
      { id: 1, name: "Ana", email: "ana@test.com", created_at: "2026-10-08T00:00:00.000Z" },
    ];
    pgQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: users, rowCount: users.length });

    const res = await request(app).get("/api/postgres/users");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ database: "postgresql", count: 1, data: users });
  });

  it("POST /api/postgres/users sin email responde 400", async () => {
    const res = await request(app).post("/api/postgres/users").send({ name: "Ana" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "name and email are required" });
    expect(pgQuery).not.toHaveBeenCalled();
  });

  it("POST /api/mongo/users crea un usuario y responde 201", async () => {
    mongoInsertOne.mockResolvedValueOnce({ insertedId: "abc123" });

    const res = await request(app)
      .post("/api/mongo/users")
      .send({ name: "Luis", email: "luis@test.com" });

    expect(res.status).toBe(201);
    expect(res.body.database).toBe("mongodb");
    expect(res.body.data).toMatchObject({
      _id: "abc123",
      name: "Luis",
      email: "luis@test.com",
    });
    expect(mongoInsertOne).toHaveBeenCalledOnce();
  });
});
