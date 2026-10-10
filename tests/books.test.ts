// tests/books.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ─── Mocks hoisted ────────────────────────────────────────────────────────────
// vi.hoisted es necesario porque vi.mock se eleva al top del archivo por Vitest.
// Las variables deben existir antes de que los mocks se registren.

const {
  mongoFind,
  mongoFindOne,
  mongoInsertOne,
  mongoFindOneAndUpdate,
  mongoDeleteOne,
} = vi.hoisted(() => ({
  mongoFind: vi.fn(),
  mongoFindOne: vi.fn(),
  mongoInsertOne: vi.fn(),
  mongoFindOneAndUpdate: vi.fn(),
  mongoDeleteOne: vi.fn(),
}));

vi.mock("../src/db/mongo.js", () => ({
  getMongoDb: () => ({
    collection: () => ({
      find: () => ({ toArray: mongoFind }),
      findOne: mongoFindOne,
      insertOne: mongoInsertOne,
      findOneAndUpdate: mongoFindOneAndUpdate,
      deleteOne: mongoDeleteOne,
    }),
  }),
}));

import { createApp } from "../src/app.js";

const app = createApp();

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────
// Datos reutilizables — un solo lugar para cambiarlos si el schema evoluciona

const VALID_ID = "64f1a2b3c4d5e6f7a8b9c0d1"; // ObjectId válido de 24 hex chars
const INVALID_ID = "not-a-valid-id";

const bookFixture = {
  _id: VALID_ID,
  title: "Clean Code",
  author: "Robert C. Martin",
  year: 2008,
  createdAt: "2026-10-10T00:00:00.000Z",
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/books", () => {
  it("devuelve lista de libros con count correcto", async () => {
    mongoFind.mockResolvedValueOnce([bookFixture]);

    const res = await request(app).get("/api/books");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      database: "mongodb",
      count: 1,
      data: [bookFixture],
    });
    expect(mongoFind).toHaveBeenCalledOnce();
  });

  it("devuelve lista vacía si no hay libros", async () => {
    mongoFind.mockResolvedValueOnce([]);

    const res = await request(app).get("/api/books");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ database: "mongodb", count: 0, data: [] });
  });

  it("responde 500 si la BD falla", async () => {
    mongoFind.mockRejectedValueOnce(new Error("DB connection lost"));

    const res = await request(app).get("/api/books");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: "error",
      database: "mongodb",
      message: "DB connection lost",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/books/:id", () => {
  it("devuelve el libro cuando el id es válido y existe", async () => {
    mongoFindOne.mockResolvedValueOnce(bookFixture);

    const res = await request(app).get(`/api/books/${VALID_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ database: "mongodb", data: bookFixture });
    expect(mongoFindOne).toHaveBeenCalledOnce();
  });

  it("responde 400 si el id no es un ObjectId válido", async () => {
    const res = await request(app).get(`/api/books/${INVALID_ID}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Invalid book id" });
    expect(mongoFindOne).not.toHaveBeenCalled(); // no debe tocar la BD
  });

  it("responde 404 si el libro no existe", async () => {
    mongoFindOne.mockResolvedValueOnce(null);

    const res = await request(app).get(`/api/books/${VALID_ID}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Book not found" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/books", () => {
  it("crea un libro con todos los campos y responde 201", async () => {
    mongoInsertOne.mockResolvedValueOnce({ insertedId: VALID_ID });

    const res = await request(app)
      .post("/api/books")
      .send({ title: "Clean Code", author: "Robert C. Martin", year: 2008 });

    expect(res.status).toBe(201);
    expect(res.body.database).toBe("mongodb");
    expect(res.body.data).toMatchObject({
      _id: VALID_ID,
      title: "Clean Code",
      author: "Robert C. Martin",
      year: 2008,
    });
    expect(mongoInsertOne).toHaveBeenCalledOnce();
  });

  it("crea un libro sin year (campo opcional)", async () => {
    mongoInsertOne.mockResolvedValueOnce({ insertedId: VALID_ID });

    const res = await request(app)
      .post("/api/books")
      .send({ title: "Clean Code", author: "Robert C. Martin" });

    expect(res.status).toBe(201);
    expect(res.body.data.year).toBeUndefined();
  });

  it("responde 400 si falta title", async () => {
    const res = await request(app)
      .post("/api/books")
      .send({ author: "Robert C. Martin" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "title and author are required" });
    expect(mongoInsertOne).not.toHaveBeenCalled();
  });

  it("responde 400 si falta author", async () => {
    const res = await request(app)
      .post("/api/books")
      .send({ title: "Clean Code" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "title and author are required" });
  });

  it("responde 400 si year no es entero positivo", async () => {
    const res = await request(app)
      .post("/api/books")
      .send({ title: "Clean Code", author: "Robert C. Martin", year: -5 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: "year must be a valid positive integer",
    });
    expect(mongoInsertOne).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("PUT /api/books/:id", () => {
  it("actualiza el libro y devuelve el documento actualizado", async () => {
    const updatedBook = { ...bookFixture, title: "Clean Code 2nd Ed", updatedAt: "2026-10-10T00:00:00.000Z" };
    mongoFindOneAndUpdate.mockResolvedValueOnce(updatedBook);

    const res = await request(app)
      .put(`/api/books/${VALID_ID}`)
      .send({ title: "Clean Code 2nd Ed", author: "Robert C. Martin", year: 2008 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ database: "mongodb", data: updatedBook });
    expect(mongoFindOneAndUpdate).toHaveBeenCalledOnce();
  });

  it("responde 400 si el id es inválido", async () => {
    const res = await request(app)
      .put(`/api/books/${INVALID_ID}`)
      .send({ title: "Clean Code", author: "Robert C. Martin" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Invalid book id" });
    expect(mongoFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("responde 400 si el body es inválido", async () => {
    const res = await request(app)
      .put(`/api/books/${VALID_ID}`)
      .send({ title: "Solo title, sin author" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "title and author are required" });
  });

  it("responde 404 si el libro no existe", async () => {
    mongoFindOneAndUpdate.mockResolvedValueOnce(null);

    const res = await request(app)
      .put(`/api/books/${VALID_ID}`)
      .send({ title: "Clean Code", author: "Robert C. Martin" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Book not found" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /api/books/:id", () => {
  it("elimina el libro y responde 200", async () => {
    mongoDeleteOne.mockResolvedValueOnce({ deletedCount: 1 });

    const res = await request(app).delete(`/api/books/${VALID_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Book deleted successfully" });
    expect(mongoDeleteOne).toHaveBeenCalledOnce();
  });

  it("responde 400 si el id es inválido", async () => {
    const res = await request(app).delete(`/api/books/${INVALID_ID}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Invalid book id" });
    expect(mongoDeleteOne).not.toHaveBeenCalled();
  });

  it("responde 404 si el libro no existe", async () => {
    mongoDeleteOne.mockResolvedValueOnce({ deletedCount: 0 });

    const res = await request(app).delete(`/api/books/${VALID_ID}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Book not found" });
  });
});