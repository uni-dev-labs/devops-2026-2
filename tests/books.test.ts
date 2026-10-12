import { beforeEach, describe, expect, it, vi } from "vitest";
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
const validBook = {
  book_name: "The Hobbit",
  author: "J. R. R. Tolkien",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Books endpoints", () => {
  it("crea un libro en PostgreSQL y responde 201", async () => {
    const savedBook = { id: 1, ...validBook };
    pgQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [savedBook], rowCount: 1 });

    const res = await request(app).post("/api/postgres/books").send(validBook);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ database: "postgresql", data: savedBook });
    expect(pgQuery).toHaveBeenCalledTimes(2);
    expect(pgQuery.mock.calls[1][1]).toEqual([validBook.book_name, validBook.author]);
  });

  it("rechaza un libro sin autor en PostgreSQL con 400", async () => {
    const res = await request(app)
      .post("/api/postgres/books")
      .send({ book_name: validBook.book_name });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "book_name and author are required" });
    expect(pgQuery).not.toHaveBeenCalled();
  });

  it("crea un libro en MongoDB y responde 201", async () => {
    mongoInsertOne.mockResolvedValueOnce({ insertedId: "book-id-1" });

    const res = await request(app).post("/api/mongo/books").send(validBook);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      database: "mongodb",
      data: { _id: "book-id-1", ...validBook },
    });
    expect(mongoInsertOne).toHaveBeenCalledOnce();
    expect(mongoInsertOne).toHaveBeenCalledWith(validBook);
  });

  it("rechaza un libro sin autor en MongoDB con 400", async () => {
    const res = await request(app)
      .post("/api/mongo/books")
      .send({ book_name: validBook.book_name });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "book_name and author are required" });
    expect(mongoInsertOne).not.toHaveBeenCalled();
  });
});
