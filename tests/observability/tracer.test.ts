import { describe, it, expect } from "vitest";
import { resolveTraceId, runWithTrace, currentTraceId, type Trace } from "../../src/observability/trace-context.js";
import { withSpan } from "../../src/observability/tracer.js";
import { TraceStore } from "../../src/observability/trace-store.js";
import { summarize } from "../../src/observability/traces.routes.js";

function newTrace(traceId = "test-trace-0001"): Trace {
  return { traceId, method: "GET", path: "/x", startedAt: new Date().toISOString(), spans: [] };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("resolveTraceId", () => {
  it("reutiliza un id entrante válido", () => {
    expect(resolveTraceId("abc-123_XYZ.789")).toBe("abc-123_XYZ.789");
  });

  it.each([undefined, "", "corto", "con espacios no", "x".repeat(129), "<script>alert(1)</script>"])(
    "genera un UUID nuevo si el entrante no sirve (%s)",
    (incoming) => {
      expect(resolveTraceId(incoming)).toMatch(/^[0-9a-f-]{36}$/);
    },
  );
});

describe("withSpan", () => {
  it("fuera de una petición ejecuta la función sin registrar nada", () => {
    expect(withSpan("nada", () => 42)).toBe(42);
  });

  it("registra spans síncronos y asíncronos con su duración", async () => {
    const trace = newTrace();
    await runWithTrace(trace, performance.now(), async () => {
      withSpan("sync", () => 1 + 1);
      await withSpan("async", () => sleep(20));
    });

    expect(trace.spans.map((s) => s.name)).toEqual(["sync", "async"]);
    expect(trace.spans.every((s) => s.status === "ok")).toBe(true);
    expect(trace.spans[1].durationMs).toBeGreaterThanOrEqual(15);
    expect(trace.spans[1].startMs).toBeGreaterThanOrEqual(trace.spans[0].startMs);
  });

  it("marca el span como error y relanza el mismo error (sync y async)", async () => {
    const trace = newTrace();
    const boom = new Error("boom");

    await runWithTrace(trace, performance.now(), async () => {
      expect(() =>
        withSpan("falla-sync", () => {
          throw boom;
        }),
      ).toThrow(boom);
      await expect(withSpan("falla-async", () => Promise.reject(boom))).rejects.toBe(boom);
    });

    expect(trace.spans).toHaveLength(2);
    expect(trace.spans.every((s) => s.status === "error" && s.error === "boom")).toBe(true);
  });

  it("no mezcla spans entre peticiones concurrentes", async () => {
    const a = newTrace("trace-aaaaaaaa");
    const b = newTrace("trace-bbbbbbbb");

    await Promise.all([
      runWithTrace(a, performance.now(), async () => {
        await withSpan("a1", () => sleep(15));
        expect(currentTraceId()).toBe("trace-aaaaaaaa");
        await withSpan("a2", () => sleep(1));
      }),
      runWithTrace(b, performance.now(), async () => {
        await withSpan("b1", () => sleep(1));
        expect(currentTraceId()).toBe("trace-bbbbbbbb");
      }),
    ]);

    expect(a.spans.map((s) => s.name)).toEqual(["a1", "a2"]);
    expect(b.spans.map((s) => s.name)).toEqual(["b1"]);
  });
});

describe("TraceStore", () => {
  it("guarda solo las últimas N trazas y devuelve primero las recientes", () => {
    const store = new TraceStore(3);
    for (let i = 1; i <= 5; i++) store.add(newTrace(`trace-0000000${i}`));

    expect(store.size).toBe(3);
    expect(store.get("trace-00000001")).toBeUndefined();
    expect(store.recent().map((t) => t.traceId)).toEqual(["trace-00000005", "trace-00000004", "trace-00000003"]);
  });
});

describe("summarize", () => {
  it("agrupa por ruta sin query string y calcula p50, p95 y errores", () => {
    const traces: Trace[] = [10, 20, 30, 40, 100].map((durationMs, i) => ({
      ...newTrace(`trace-sum-000${i}`),
      path: `/api/postgres/users?page=${i}`,
      durationMs,
      statusCode: i === 4 ? 500 : 200,
    }));

    const [stats] = summarize(traces);
    expect(stats).toMatchObject({
      route: "GET /api/postgres/users",
      count: 5,
      errors: 1,
      avgMs: 40,
      p50Ms: 30,
      p95Ms: 100,
      maxMs: 100,
    });
  });
});
