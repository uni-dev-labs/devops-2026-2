import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// 1. Preparamos el mock de MongoDB
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

// 2. Limpiamos antes de cada prueba
beforeEach(() => {
    vi.clearAllMocks();
});

describe("Universities endpoints", () => {
  // Test 1: Caso exitoso
    it("POST /api/universities crea una universidad y responde 201", async () => {
    // Simulamos que Mongo devuelve un ID falso
    mongoInsertOne.mockResolvedValueOnce({ insertedId: "uni123" });
    
    const res = await request(app)
        .post("/api/universities")
        .send({ name: "Universidad Santo Tomás", students: 5000 });
    
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ id: "uni123", name: "Universidad Santo Tomás", students: 5000 });
    expect(mongoInsertOne).toHaveBeenCalledOnce();
    });

  // Test 2: Caso de validación (error)
    it("POST /api/universities sin estudiantes responde 400", async () => {
    const res = await request(app)
        .post("/api/universities")
      .send({ name: "Universidad Santo Tomás" }); // Falta el campo students
    
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "name and a positive students count are required" });
    expect(mongoInsertOne).not.toHaveBeenCalled();
    });
});