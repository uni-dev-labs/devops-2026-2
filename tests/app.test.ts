import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { pgQuery, mongoInsertOne, redisHGetAll, redisHSet, redisPing } = vi.hoisted(() => ({
  pgQuery: vi.fn(),
  mongoInsertOne: vi.fn(),
  redisHGetAll: vi.fn(),
  redisHSet: vi.fn(),
  redisPing: vi.fn(),
}));

vi.mock("../src/db/postgres.js", () => ({
  pgPool: { query: pgQuery },
}));

vi.mock("../src/db/mongo.js", () => ({
  getMongoDb: () => ({
    collection: () => ({ insertOne: mongoInsertOne }),
  }),
}));

vi.mock("../src/db/redis.js", () => ({
  getRedisClient: () => ({
    hGetAll: redisHGetAll,
    hSet: redisHSet,
    ping: redisPing,
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

  it("GET /api/redis/health responde con el estado de Redis", async () => {
    redisPing.mockResolvedValueOnce("PONG");

    const res = await request(app).get("/api/redis/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", database: "redis", ping: "PONG" });
  });

  it("GET /api/redis/users devuelve usuarios almacenados en Redis", async () => {
    const user = { id: "user-1", name: "Eva", email: "eva@test.com", createdAt: "2026-10-08T00:00:00.000Z" };
    redisHGetAll.mockResolvedValueOnce({ "user-1": JSON.stringify(user) });

    const res = await request(app).get("/api/redis/users");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ database: "redis", count: 1, data: [user] });
    expect(redisHGetAll).toHaveBeenCalledWith("users");
  });

  it("POST /api/redis/users sin email responde 400", async () => {
    const res = await request(app).post("/api/redis/users").send({ name: "Eva" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "name and email are required" });
    expect(redisHSet).not.toHaveBeenCalled();
  });

  it("POST /api/redis/users crea un usuario y responde 201", async () => {
    redisHSet.mockResolvedValueOnce(1);

    const res = await request(app)
      .post("/api/redis/users")
      .send({ name: "Eva", email: "eva@test.com" });

    expect(res.status).toBe(201);
    expect(res.body.database).toBe("redis");
    expect(res.body.data).toMatchObject({
      name: "Eva",
      email: "eva@test.com",
    });
    expect(res.body.data.id).toEqual(expect.any(String));
    expect(res.body.data.createdAt).toEqual(expect.any(String));
    expect(redisHSet).toHaveBeenCalledWith("users", res.body.data.id, JSON.stringify(res.body.data));
  });
});
