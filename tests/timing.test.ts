import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { withTiming, setTimingSink, getTimingSink, NO_TRACE_ID } from "../src/observability/timing.js";
import { runWithTrace } from "../src/observability/trace-context.js";
import { InMemoryTimingSink, NoopTimingSink, type TimingSink } from "../src/observability/timing-sink.js";

let sink: InMemoryTimingSink;
let previousSink: TimingSink;

beforeEach(() => {
  previousSink = getTimingSink();
  sink = new InMemoryTimingSink();
  setTimingSink(sink);
});

afterEach(() => {
  setTimingSink(previousSink);
});

describe("withTiming", () => {
  it("devuelve el mismo valor que la función y registra un span ok (síncrono)", () => {
    const result = withTiming("service", "suma", () => 2 + 3);

    expect(result).toBe(5);
    expect(sink.spans).toHaveLength(1);
    expect(sink.spans[0]).toMatchObject({ layer: "service", name: "suma", status: "ok" });
    expect(sink.spans[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("espera a las funciones asíncronas y mide su duración real", async () => {
    const result = await withTiming("db", "consulta-lenta", async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return "listo";
    });

    expect(result).toBe("listo");
    expect(sink.spans).toHaveLength(1);
    // Margen bajo 30 ms porque los timers de Node pueden adelantarse ~1 ms.
    expect(sink.spans[0].durationMs).toBeGreaterThanOrEqual(25);
  });

  it("registra status error y relanza el mismo error (síncrono)", () => {
    const boom = new Error("falló");

    expect(() =>
      withTiming("service", "falla", () => {
        throw boom;
      }),
    ).toThrow(boom);
    expect(sink.spans[0]).toMatchObject({ status: "error", error: "falló" });
  });

  it("registra status error y relanza el rechazo (asíncrono)", async () => {
    const boom = new Error("db caída");

    await expect(withTiming("db", "falla-async", () => Promise.reject(boom))).rejects.toBe(boom);
    expect(sink.spans[0]).toMatchObject({ status: "error", error: "db caída" });
  });

  it("usa no-trace cuando se mide fuera de una petición", () => {
    withTiming("service", "suelta", () => 1);

    expect(sink.spans[0].traceId).toBe(NO_TRACE_ID);
    expect(sink.spans[0].parentSpanId).toBeUndefined();
  });

  it("anida spans: comparten traceId y el hijo apunta al padre", async () => {
    await runWithTrace({ traceId: "t-1" }, () =>
      withTiming("service", "padre", async () => {
        await withTiming("db", "hijo", async () => undefined);
      }),
    );

    const hijo = sink.spans.find((s) => s.name === "hijo")!;
    const padre = sink.spans.find((s) => s.name === "padre")!;

    expect(hijo.traceId).toBe("t-1");
    expect(padre.traceId).toBe("t-1");
    expect(hijo.parentSpanId).toBe(padre.spanId);
    expect(padre.parentSpanId).toBeUndefined();
  });

  it("no mezcla trazas de peticiones concurrentes", async () => {
    const work = (traceId: string, delayMs: number) =>
      runWithTrace({ traceId }, () =>
        withTiming("service", `trabajo-${traceId}`, async () => {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          await withTiming("db", `query-${traceId}`, async () => undefined);
        }),
      );

    await Promise.all([work("A", 20), work("B", 5)]);

    for (const id of ["A", "B"]) {
      const query = sink.spans.find((s) => s.name === `query-${id}`)!;
      expect(query.traceId).toBe(id);
    }
  });

  it("con el NoopTimingSink no registra nada ni rompe", () => {
    setTimingSink(new NoopTimingSink());

    expect(withTiming("service", "silenciosa", () => 42)).toBe(42);
  });
});
