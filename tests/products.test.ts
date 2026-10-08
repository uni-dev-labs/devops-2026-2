import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const { mongoFind, mongoInsertOne } = vi.hoisted(() => ({
  mongoFind: vi.fn(),
  mongoInsertOne: vi.fn(),
}));

vi.mock("../src/db/mongo.js", () => ({
  getMongoDb: () => ({
    collection: () => ({
      find: () => ({ toArray: mongoFind }),
      insertOne: mongoInsertOne,
    }),
  }),
}));

import { createApp } from "../src/app.js";

const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Products endpoints", () => {
  it("GET /api/products devuelve los productos almacenados", async () => {
    const products = [
      { _id: "product-1", name: "Teclado", price: 120000 },
    ];
    mongoFind.mockResolvedValueOnce(products);

    const res = await request(app).get("/api/products");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      database: "mongodb",
      count: 1,
      data: products,
    });
  });

  it("POST /api/products crea un producto y responde 201", async () => {
    mongoInsertOne.mockResolvedValueOnce({ insertedId: "product-1" });

    const res = await request(app)
      .post("/api/products")
      .send({ name: "Teclado", price: 120000 });

    expect(res.status).toBe(201);
    expect(res.body.database).toBe("mongodb");
    expect(res.body.data).toMatchObject({
      _id: "product-1",
      name: "Teclado",
      price: 120000,
    });
    expect(res.body.data.createdAt).toEqual(expect.any(String));
    expect(mongoInsertOne).toHaveBeenCalledOnce();
  });

  it("POST /api/products sin precio positivo responde 400", async () => {
    const res = await request(app)
      .post("/api/products")
      .send({ name: "Teclado", price: 0 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: "name and a positive price are required",
    });
    expect(mongoInsertOne).not.toHaveBeenCalled();
  });
});
