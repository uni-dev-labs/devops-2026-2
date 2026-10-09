import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { pgQuery, mongoInsertOne, mongoFindOneAndUpdate } = vi.hoisted(() => ({
  pgQuery: vi.fn(),
  mongoInsertOne: vi.fn(),
  mongoFindOneAndUpdate: vi.fn(),
}));

vi.mock("../src/db/postgres.js", () => ({
  pgPool: { query: pgQuery },
}));

vi.mock("../src/db/mongo.js", () => ({
  getMongoDb: () => ({
    collection: () => ({
      insertOne: mongoInsertOne,
      findOneAndUpdate: mongoFindOneAndUpdate,
    }),
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

describe("Update de usuarios (PUT /users/:id)", () => {
  it("PUT /api/postgres/users/:id actualiza el usuario y responde 200", async () => {
    const updated = {
      id: 1,
      name: "Ana María",
      email: "ana@test.com",
      created_at: "2026-10-08T00:00:00.000Z",
    };
    pgQuery.mockResolvedValueOnce({ rows: [updated], rowCount: 1 });

    const res = await request(app)
      .put("/api/postgres/users/1")
      .send({ name: "Ana María" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ database: "postgresql", data: updated });
    expect(pgQuery).toHaveBeenCalledWith(expect.stringContaining("UPDATE users"), [
      "Ana María",
      null,
      1,
    ]);
  });

  it("PUT /api/postgres/users/:id con id inexistente responde 404", async () => {
    pgQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .put("/api/postgres/users/999")
      .send({ email: "nuevo@test.com" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "User not found" });
  });

  it("PUT /api/postgres/users/:id con id inválido responde 400", async () => {
    const res = await request(app).put("/api/postgres/users/abc").send({ name: "Ana" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "id must be a positive integer" });
    expect(pgQuery).not.toHaveBeenCalled();
  });

  it("PUT /api/postgres/users/:id sin name ni email responde 400", async () => {
    const res = await request(app).put("/api/postgres/users/1").send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "name or email is required" });
    expect(pgQuery).not.toHaveBeenCalled();
  });

  it("PUT /api/postgres/users/:id con email duplicado responde 409", async () => {
    pgQuery.mockRejectedValueOnce(Object.assign(new Error("duplicate key"), { code: "23505" }));

    const res = await request(app)
      .put("/api/postgres/users/1")
      .send({ email: "repetido@test.com" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "email already exists" });
  });

  it("PUT /api/mongo/users/:id actualiza el usuario y responde 200", async () => {
    const id = "652f1c2b9d1e4a0012345678";
    mongoFindOneAndUpdate.mockResolvedValueOnce({
      _id: id,
      name: "Luis",
      email: "luis.nuevo@test.com",
    });

    const res = await request(app)
      .put(`/api/mongo/users/${id}`)
      .send({ email: "luis.nuevo@test.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      database: "mongodb",
      data: { _id: id, name: "Luis", email: "luis.nuevo@test.com" },
    });
    expect(mongoFindOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { $set: { email: "luis.nuevo@test.com" } },
      { returnDocument: "after" }
    );
  });

  it("PUT /api/mongo/users/:id con id inexistente responde 404", async () => {
    mongoFindOneAndUpdate.mockResolvedValueOnce(null);

    const res = await request(app)
      .put("/api/mongo/users/652f1c2b9d1e4a0012345678")
      .send({ name: "Luis" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "User not found" });
  });

  it("PUT /api/mongo/users/:id con ObjectId inválido responde 400", async () => {
    const res = await request(app).put("/api/mongo/users/no-valido").send({ name: "Luis" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "id is not a valid ObjectId" });
    expect(mongoFindOneAndUpdate).not.toHaveBeenCalled();
  });
});
