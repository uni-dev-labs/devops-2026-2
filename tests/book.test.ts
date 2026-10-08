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

describe("Books endpoints", () => {
  // Test 1: caso exitoso
  it("POST /api/books crea un libro y responde 201", async () => {
    mongoInsertOne.mockResolvedValueOnce({ insertedId: "b1" }); // Arrange

    const res = await request(app) // Act
      .post("/api/books")
      .send({ title: "Cien años de soledad", author: "Gabriel García Márquez" });

    expect(res.status).toBe(201); // Assert
    expect(res.body.data).toMatchObject({
      _id: "b1",
      title: "Cien años de soledad",
      author: "Gabriel García Márquez",
    });
    expect(mongoInsertOne).toHaveBeenCalledOnce();
  });

  // Test 2: validación
  it("POST /api/books sin autor responde 400", async () => {
    const res = await request(app).post("/api/books").send({ title: "Cien años de soledad" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "title and author are required" });
    expect(mongoInsertOne).not.toHaveBeenCalled();
  });
});