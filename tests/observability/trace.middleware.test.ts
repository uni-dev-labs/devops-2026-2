import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { pgQuery } = vi.hoisted(() => ({ pgQuery: vi.fn() }));

vi.mock("../../src/db/postgres.js", () => ({ pgPool: { query: pgQuery } }));
vi.mock("../../src/db/mongo.js", () => ({
  getMongoDb: () => ({ command: vi.fn().mockRejectedValue(new Error("mongo caído")) }),
}));

import { createApp } from "../../src/app.js";
import { TraceStore } from "../../src/observability/trace-store.js";
import { resetUsersTableCache } from "../../src/routes/postgres.routes.js";

const store = new TraceStore(100);
const app = createApp({ traceStore: store, traceLog: false, traceEndpoint: true });

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  resetUsersTableCache();
});

describe("trazabilidad de peticiones HTTP", () => {
  it("devuelve un X-Trace-Id nuevo en cada respuesta", async () => {
    const a = await request(app).get("/health");
    const b = await request(app).get("/health");

    expect(a.headers["x-trace-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(b.headers["x-trace-id"]).not.toBe(a.headers["x-trace-id"]);
  });

  it("propaga el X-Trace-Id que manda el cliente", async () => {
    const res = await request(app).get("/health").set("X-Trace-Id", "cliente-trace-42");
    expect(res.headers["x-trace-id"]).toBe("cliente-trace-42");
  });

  it("expone los headers de trazabilidad por CORS", async () => {
    const res = await request(app).get("/health").set("Origin", "http://localhost:5173");
    expect(res.headers["access-control-expose-headers"]).toContain("X-Trace-Id");
    expect(res.headers["access-control-expose-headers"]).toContain("Server-Timing");
  });

  it("desglosa la petición en spans y los manda en Server-Timing", async () => {
    pgQuery
      .mockResolvedValueOnce({}) // CREATE TABLE
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).get("/api/postgres/users?page=2&limit=5");

    expect(res.status).toBe(200);
    const serverTiming = res.headers["server-timing"];
    expect(serverTiming).toContain('desc="pagination.parse"');
    expect(serverTiming).toContain('desc="pg.ensureUsersTable"');
    expect(serverTiming).toContain('desc="pg.selectUsers"');
    expect(serverTiming).toMatch(/total;dur=\d+(\.\d+)?$/);

    const trace = store.get(res.headers["x-trace-id"]);
    expect(trace).toMatchObject({ method: "GET", path: "/api/postgres/users?page=2&limit=5", statusCode: 200 });
    expect(trace!.spans.map((s) => s.name)).toEqual(["pagination.parse", "pg.ensureUsersTable", "pg.selectUsers"]);
    // La suma de los tramos nunca supera el total de la petición.
    const spansTotal = trace!.spans.reduce((sum, s) => sum + s.durationMs, 0);
    expect(spansTotal).toBeLessThanOrEqual(trace!.durationMs! + 0.01);
  });

  it("el CREATE TABLE de users corre una sola vez y se reintenta si falla", async () => {
    pgQuery
      .mockRejectedValueOnce(new Error("postgres caído")) // 1ª petición: falla el CREATE TABLE
      .mockResolvedValueOnce({}) // 2ª: CREATE TABLE ok
      .mockResolvedValue({ rows: [], rowCount: 0 }); // SELECTs

    const failed = await request(app).get("/api/postgres/users");
    const second = await request(app).get("/api/postgres/users");
    const third = await request(app).get("/api/postgres/users");

    expect([failed.status, second.status, third.status]).toEqual([500, 200, 200]);
    expect(store.get(failed.headers["x-trace-id"])!.spans).toEqual([
      expect.objectContaining({ name: "pagination.parse" }),
      expect.objectContaining({ name: "pg.ensureUsersTable", status: "error", error: "postgres caído" }),
    ]);
    expect(second.headers["server-timing"]).toContain("pg.ensureUsersTable");
    expect(third.headers["server-timing"]).not.toContain("pg.ensureUsersTable");
    expect(pgQuery).toHaveBeenCalledTimes(4); // CREATE fallido + CREATE + 2 SELECT
  });

  it("registra el span fallido cuando la base de datos falla", async () => {
    const res = await request(app).get("/api/mongo/health");

    expect(res.status).toBe(503);
    const trace = store.get(res.headers["x-trace-id"]);
    expect(trace!.spans).toEqual([
      expect.objectContaining({ name: "mongo.ping", status: "error", error: "mongo caído" }),
    ]);
  });

  it("GET /api/traces/:id devuelve la traza de una petición anterior", async () => {
    const first = await request(app).get("/health");
    const res = await request(app).get(`/api/traces/${first.headers["x-trace-id"]}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ traceId: first.headers["x-trace-id"], path: "/health", statusCode: 200 });
  });

  it("GET /api/traces/stats resume latencias por ruta sin contarse a sí mismo", async () => {
    await request(app).get("/health");
    await request(app).get("/health");
    await request(app).get("/no-existe");

    const res = await request(app).get("/api/traces/stats");

    expect(res.body.sampled).toBe(3);
    const routes = res.body.routes.map((r: { route: string }) => r.route);
    expect(routes).toEqual(expect.arrayContaining(["GET /health", "GET /no-existe"]));
    expect(routes.some((r: string) => r.includes("/api/traces"))).toBe(false);
  });

  it("GET /api/traces/:id responde 404 si no existe", async () => {
    const res = await request(app).get("/api/traces/no-existe-1234");
    expect(res.status).toBe(404);
  });

  it("el endpoint /api/traces se puede apagar", async () => {
    const closed = createApp({ traceStore: new TraceStore(10), traceLog: false, traceEndpoint: false });
    const res = await request(closed).get("/api/traces");
    expect(res.status).toBe(404);
    expect(res.headers["x-trace-id"]).toBeDefined(); // la trazabilidad sigue activa
  });

  it("escribe una línea JSON por petición cuando el log está activo", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logged = createApp({ traceStore: new TraceStore(10), traceLog: true });

    const res = await request(logged).get("/health");

    const line = JSON.parse(spy.mock.calls.at(-1)![0] as string);
    expect(line).toMatchObject({ msg: "request", traceId: res.headers["x-trace-id"], status: 200, path: "/health" });
    spy.mockRestore();
  });
});
