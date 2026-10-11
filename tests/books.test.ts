import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("Books endpoints", () => {
  it("POST /api/books crea un libro y responde 201", async () => {
    mongoInsertOne.mockResolvedValueOnce({ insertedId: "book-123" });

    const res = await request(app)
      .post("/api/books")
      .send({ title: "El principito", author: "Antoine de Saint-Exupery" });

    expect(res.status).toBe(201);
    expect(res.body.database).toBe("mongodb");
    expect(res.body.data).toMatchObject({
      _id: "book-123",
      title: "El principito",
      author: "Antoine de Saint-Exupery",
    });
    expect(mongoInsertOne).toHaveBeenCalledWith({
      title: "El principito",
      author: "Antoine de Saint-Exupery",
      createdAt: expect.any(Date),
    });
    expect(mongoInsertOne).toHaveBeenCalledOnce();
  });

  it("POST /api/books sin autor responde 400", async () => {
    const res = await request(app)
      .post("/api/books")
      .send({ title: "El principito" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: "title and author are required",
    });
    expect(mongoInsertOne).not.toHaveBeenCalled();
  });
});
