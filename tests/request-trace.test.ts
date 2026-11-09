import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
import { getTimingSink, setTimingSink } from "../src/observability/timing.js";
import { InMemoryTimingSink, type TimingSink } from "../src/observability/timing-sink.js";
import { TRACE_ID_HEADER } from "../src/observability/request-trace.middleware.js";

const app = createApp();

let sink: InMemoryTimingSink;
let previousSink: TimingSink;

beforeEach(() => {
  vi.clearAllMocks();
  previousSink = getTimingSink();
  sink = new InMemoryTimingSink();
  setTimingSink(sink);
});

afterEach(() => {
  setTimingSink(previousSink);
});

describe("requestTrace (middleware)", () => {
  it("devuelve X-Trace-Id y registra el span http de la petición", async () => {
    const res = await request(app).get("/health");
    const traceId = res.headers[TRACE_ID_HEADER.toLowerCase()];

    expect(traceId).toBeTruthy();
    await vi.waitFor(() => expect(sink.spans).toHaveLength(1));
    expect(sink.spans[0]).toMatchObject({
      layer: "http",
      name: "GET /health",
      status: "ok",
      traceId,
      meta: { statusCode: 200 },
    });
  });

  it("usa el patrón de la ruta y no la URL real en el nombre del span", async () => {
    pgQuery.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await request(app).get("/api/postgres/users?page=2&limit=5");

    await vi.waitFor(() => expect(sink.spans.some((s) => s.layer === "http")).toBe(true));
    expect(sink.spans.find((s) => s.layer === "http")!.name).toBe("GET /api/postgres/users");
  });

  it("une en una sola traza los spans de http, service y db de una petición", async () => {
    pgQuery.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).get("/api/postgres/users");
    const traceId = res.headers[TRACE_ID_HEADER.toLowerCase()];

    await vi.waitFor(() => expect(sink.spans.some((s) => s.layer === "http")).toBe(true));

    const names = sink.spans.map((s) => s.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "parsePagination",
        "postgres.ensureUsersTable",
        "postgres.users.select",
        "GET /api/postgres/users",
      ]),
    );
    expect(sink.spans.every((s) => s.traceId === traceId)).toBe(true);

    // Los spans de servicio y db cuelgan del span http.
    const http = sink.spans.find((s) => s.layer === "http")!;
    const select = sink.spans.find((s) => s.name === "postgres.users.select")!;
    expect(select.parentSpanId).toBe(http.spanId);
  });

  it("dos peticiones distintas generan trazas distintas", async () => {
    const a = await request(app).get("/health");
    const b = await request(app).get("/health");

    expect(a.headers[TRACE_ID_HEADER.toLowerCase()]).not.toBe(
      b.headers[TRACE_ID_HEADER.toLowerCase()],
    );
  });

  it("marca como error un span db que falla y el http con 5xx", async () => {
    mongoInsertOne.mockRejectedValueOnce(new Error("mongo caído"));

    const res = await request(app).post("/api/products").send({ name: "Teclado", price: 100 });

    expect(res.status).toBe(500);
    await vi.waitFor(() => expect(sink.spans.some((s) => s.layer === "http")).toBe(true));
    expect(sink.spans.find((s) => s.name === "mongo.products.insertOne")).toMatchObject({
      layer: "db",
      status: "error",
      error: "mongo caído",
    });
    expect(sink.spans.find((s) => s.layer === "http")).toMatchObject({ status: "error" });
  });
});
