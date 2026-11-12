import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { pgQuery } = vi.hoisted(() => ({ pgQuery: vi.fn() }));

vi.mock("../src/db/postgres.js", () => ({
  pgPool: { query: pgQuery },
}));

vi.mock("../src/db/mongo.js", () => ({
  getMongoDb: () => ({ collection: () => ({}) }),
}));

import { createApp } from "../src/app.js";
import { reiniciarTrazabilidad, registrarTiempo, resumenTrazabilidad } from "../src/middlewares/trazabilidad.js";

const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
  reiniciarTrazabilidad();
});

describe("Trazabilidad de tiempos", () => {
  it("agrega X-Response-Time y X-Request-Id a cada respuesta", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.headers["x-response-time"]).toMatch(/^\d+\.\d{3}ms$/);
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("respeta el X-Request-Id que envía el cliente", async () => {
    const res = await request(app).get("/health").set("X-Request-Id", "traza-123");

    expect(res.headers["x-request-id"]).toBe("traza-123");
  });

  it("GET /api/trazabilidad resume los tiempos por endpoint", async () => {
    await request(app).get("/health");
    await request(app).get("/health");
    await request(app).get("/no-existe");

    const res = await request(app).get("/api/trazabilidad");

    expect(res.status).toBe(200);
    const health = res.body.servicios.find((s: { servicio: string }) => s.servicio === "GET /health");
    expect(health.llamadas).toBe(2);
    expect(health.promedioMs).toBeGreaterThanOrEqual(0);
    expect(health.maxMs).toBeGreaterThanOrEqual(health.minMs);
    expect(res.body.general.llamadas).toBe(3);
    expect(res.body.servicios.some((s: { servicio: string }) => s.servicio.includes("/api/trazabilidad"))).toBe(false);
  });

  it("agrupa rutas con parámetros y cuenta los errores 5xx", async () => {
    pgQuery.mockRejectedValueOnce(new Error("db caída"));

    await request(app).get("/api/postgres/users?page=1&limit=5");

    const servicio = resumenTrazabilidad().servicios.find((s) => s.servicio === "GET /api/postgres/users");
    expect(servicio?.llamadas).toBe(1);
    expect(servicio?.errores).toBe(1);
  });

  it("calcula promedio, mínimo, máximo y p95", () => {
    for (const ms of [1, 2, 3, 4, 10]) registrarTiempo("GET /demo", ms);

    const [demo] = resumenTrazabilidad().servicios;
    expect(demo).toMatchObject({ llamadas: 5, promedioMs: 4, minMs: 1, maxMs: 10, p95Ms: 10, totalMs: 20 });
  });

  it("DELETE /api/trazabilidad reinicia las métricas", async () => {
    await request(app).get("/health");

    const res = await request(app).delete("/api/trazabilidad");

    expect(res.status).toBe(204);
    expect(resumenTrazabilidad().general.llamadas).toBe(0);
  });
});
