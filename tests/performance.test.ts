import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Las bases de datos se simulan, igual que en app.test.ts: el test no necesita Docker.
const { pgQuery, mongoCommand, mongoToArray } = vi.hoisted(() => ({
  pgQuery: vi.fn(),
  mongoCommand: vi.fn(),
  mongoToArray: vi.fn(),
}));

vi.mock("../src/db/postgres.js", () => ({
  pgPool: { query: pgQuery },
}));

vi.mock("../src/db/mongo.js", () => ({
  getMongoDb: () => ({
    command: mongoCommand,
    collection: () => ({ find: () => ({ limit: () => ({ toArray: mongoToArray }) }) }),
  }),
}));

import { createApp } from "../src/app.js";
import {
  parseIterations,
  measure,
  DEFAULT_ITERATIONS,
  MAX_ITERATIONS,
} from "../src/routes/performance.routes.js";

const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "table").mockImplementation(() => {});
  pgQuery.mockResolvedValue({ rows: [] });
  mongoCommand.mockResolvedValue({ ok: 1 });
  mongoToArray.mockResolvedValue([]);
});

describe("parseIterations", () => {
  it("usa 1000 por defecto cuando falta o es inválido", () => {
    expect(parseIterations(undefined)).toBe(DEFAULT_ITERATIONS);
    expect(parseIterations("abc")).toBe(DEFAULT_ITERATIONS);
    expect(parseIterations("-5")).toBe(DEFAULT_ITERATIONS);
    expect(parseIterations("0")).toBe(DEFAULT_ITERATIONS);
    expect(parseIterations("2.5")).toBe(DEFAULT_ITERATIONS);
  });

  it("acepta enteros positivos y aplica el tope de 10000", () => {
    expect(parseIterations("200")).toBe(200);
    expect(parseIterations("999999")).toBe(MAX_ITERATIONS);
  });
});

describe("measure", () => {
  it("calcula las métricas de una operación correcta", async () => {
    const result = await measure("svc", "op", 5, () => 1);

    expect(result).toMatchObject({ service: "svc", operation: "op", status: "ok", iterations: 5 });
    expect(result.minMs).toBeLessThanOrEqual(result.avgMs);
    expect(result.avgMs).toBeLessThanOrEqual(result.maxMs);
  });

  it("devuelve status error con el mensaje si la operación falla", async () => {
    const result = await measure("svc", "op", 3, () => {
      throw new Error("boom");
    });

    expect(result.status).toBe("error");
    expect(result.message).toBe("boom");
  });
});

describe("GET /api/performance", () => {
  it("responde con la forma esperada", async () => {
    const res = await request(app).get("/api/performance?iterations=10");

    expect(res.status).toBe(200);
    expect(res.body.iterations).toBe(10);
    expect(res.body.unit).toBe("ms");
    expect(res.body.count).toBe(res.body.data.length);
    expect(res.body.data[0]).toEqual(
      expect.objectContaining({
        service: expect.any(String),
        operation: expect.any(String),
        status: "ok",
        iterations: expect.any(Number),
        totalMs: expect.any(Number),
        avgMs: expect.any(Number),
        minMs: expect.any(Number),
        maxMs: expect.any(Number),
      })
    );
    const services = new Set(res.body.data.map((m: { service: string }) => m.service));
    expect(services).toEqual(
      new Set(["pagination.service", "product-store", "postgresql", "mongodb"])
    );
    expect(console.table).toHaveBeenCalledOnce();
  });

  it("usa 1000 iteraciones si ?iterations es inválido", async () => {
    const res = await request(app).get("/api/performance?iterations=abc");

    expect(res.status).toBe(200);
    expect(res.body.iterations).toBe(DEFAULT_ITERATIONS);
  });

  it("limita ?iterations a 10000", async () => {
    const res = await request(app).get("/api/performance?iterations=50000");

    expect(res.body.iterations).toBe(MAX_ITERATIONS);
  }, 60000);

  it("no se cae si una base de datos falla: marca esa operación como error", async () => {
    pgQuery.mockRejectedValue(new Error("pg caído"));

    const res = await request(app).get("/api/performance?iterations=5");

    expect(res.status).toBe(200);
    const pg = res.body.data.filter((m: { service: string }) => m.service === "postgresql");
    expect(pg.every((m: { status: string }) => m.status === "error")).toBe(true);
    expect(pg[0].message).toBe("pg caído");
  });
});
