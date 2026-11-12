import { performance } from "node:perf_hooks";
import type { NextFunction, Request, Response } from "express";
import { resolveTraceId, runWithTrace, type Span, type Trace } from "./trace-context.js";
import { round } from "./tracer.js";
import type { TraceStore } from "./trace-store.js";

export const TRACE_HEADER = "X-Trace-Id";

export type TraceMiddlewareOptions = {
  store: TraceStore;
  /** Escribe una línea JSON por petición en la consola. */
  log: boolean;
  /** Peticiones más lentas que esto se marcan como `slow` en el log. */
  slowMs: number;
};

// Server-Timing es un header estándar (W3C): el navegador lo muestra en DevTools → Network → Timing.
function toServerTiming(spans: Span[], totalMs: number): string {
  const parts = spans.map(
    (s, i) => `s${i};dur=${s.durationMs};desc="${s.name.replace(/["\\]/g, "")}"`,
  );
  parts.push(`total;dur=${round(totalMs)}`);
  return parts.join(", ");
}

/**
 * Abre una traza por cada petición HTTP:
 * - reutiliza el X-Trace-Id entrante o genera uno nuevo, y lo devuelve en la respuesta;
 * - mide la duración total y deja que el código de la ruta agregue spans con `withSpan`;
 * - agrega el header Server-Timing con el desglose y guarda la traza en el TraceStore.
 */
export function traceMiddleware({ store, log, slowMs }: TraceMiddlewareOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = performance.now();
    const trace: Trace = {
      traceId: resolveTraceId(req.get(TRACE_HEADER)),
      method: req.method,
      path: req.originalUrl,
      startedAt: new Date().toISOString(),
      spans: [],
    };

    res.setHeader(TRACE_HEADER, trace.traceId);

    // Justo antes de enviar los headers ya terminaron los spans de la ruta: se agrega Server-Timing.
    const writeHead = res.writeHead;
    res.writeHead = function (this: Response, ...args: Parameters<Response["writeHead"]>) {
      if (!this.headersSent) {
        this.setHeader("Server-Timing", toServerTiming(trace.spans, performance.now() - origin));
      }
      return writeHead.apply(this, args);
    } as Response["writeHead"];

    res.on("finish", () => {
      trace.statusCode = res.statusCode;
      trace.durationMs = round(performance.now() - origin);
      store.add(trace);

      if (log) {
        const line = {
          level: trace.durationMs >= slowMs ? "warn" : "info",
          msg: "request",
          traceId: trace.traceId,
          method: trace.method,
          path: trace.path,
          status: trace.statusCode,
          durationMs: trace.durationMs,
          slow: trace.durationMs >= slowMs,
          spans: trace.spans.map((s) => `${s.name}=${s.durationMs}ms${s.status === "error" ? "!" : ""}`),
        };
        console.log(JSON.stringify(line));
      }
    });

    runWithTrace(trace, origin, () => next());
  };
}
