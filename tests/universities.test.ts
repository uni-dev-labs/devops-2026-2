import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { pgQuery } = vi.hoisted(() => ({ pgQuery: vi.fn() }));

vi.mock("../src/db/postgres.js", () => ({
  pgPool: { query: pgQuery },
}));

vi.mock("../src/db/mongo.js", () => ({
  getMongoDb: vi.fn(),
}));

import { createApp } from "../src/app.js";

const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Servicio de universidades", () => {
  it("GET /api/universities devuelve la lista de universidades", async () => {
    const universities = [
      { id: 1, name: "Universidad Santo Tomás", city: "Tunja", created_at: "2026-10-11T00:00:00.000Z" },
      { id: 2, name: "UPTC", city: "Tunja", created_at: "2026-10-11T00:00:00.000Z" },
    ];
    pgQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: universities, rowCount: universities.length });

    const res = await request(app).get("/api/universities");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ database: "postgresql", count: 2, data: universities });
  });

  it("POST /api/universities sin ciudad responde 400 y no toca la base de datos", async () => {
    const res = await request(app)
      .post("/api/universities")
      .send({ name: "Universidad Santo Tomás" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "city is required" });
    expect(pgQuery).not.toHaveBeenCalled();
  });
});