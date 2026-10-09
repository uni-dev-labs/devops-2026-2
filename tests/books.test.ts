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

describe("Books endpoints", () => {
  it("POST /api/books crea un libro y responde 201", async () => {
    mongoInsertOne.mockResolvedValueOnce({ insertedId: "b1" });

    const res = await request(app)
      .post("/api/books")
      .send({ title: "Cien años de soledad", author: "Gabriel García Márquez", pages: 471 });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      _id: "b1",
      title: "Cien años de soledad",
      author: "Gabriel García Márquez",
      pages: 471,
    });
    expect(mongoInsertOne).toHaveBeenCalledOnce();
  });

  it("POST /api/books sin autor responde 400", async () => {
    const res = await request(app)
      .post("/api/books")
      .send({ title: "Cien años de soledad", pages: 471 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: "title, author and a positive pages number are required",
    });
    expect(mongoInsertOne).not.toHaveBeenCalled();
  });

  it("GET /api/books devuelve la lista", async () => {
    mongoFind.mockResolvedValueOnce([
      { _id: "b1", title: "Cien años de soledad", author: "Gabriel García Márquez", pages: 471 },
    ]);

    const res = await request(app).get("/api/books");

    expect(res.status).toBe(200);
    expect(res.body.database).toBe("mongodb");
    expect(res.body.count).toBe(1);
  });
});