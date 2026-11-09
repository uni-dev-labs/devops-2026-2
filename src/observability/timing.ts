import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { env } from "../config/env.js";
import { getTraceContext, runWithTrace } from "./trace-context.js";
import {
  ConsoleTimingSink,
  NoopTimingSink,
  type Span,
  type SpanLayer,
  type SpanStatus,
  type TimingSink,
} from "./timing-sink.js";

/** traceId que se usa cuando una función se mide fuera de una petición HTTP (scripts, arranque). */
export const NO_TRACE_ID = "no-trace";

let sink: TimingSink = env.tracing.enabled ? new ConsoleTimingSink() : new NoopTimingSink();

export function setTimingSink(next: TimingSink): void {
  sink = next;
}

export function getTimingSink(): TimingSink {
  return sink;
}

export type SpanResult = {
  status?: SpanStatus;
  error?: unknown;
  /** Permite fijar el nombre al terminar (el middleware solo conoce la ruta al final). */
  name?: string;
  meta?: Record<string, string | number>;
};

export type SpanHandle = {
  spanId: string;
  end(result?: SpanResult): void;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Abre un span y devuelve un handle para cerrarlo.
 * Usa performance.now() (reloj monotónico): a diferencia de Date.now(), no se ve
 * afectado por ajustes del reloj del sistema y tiene resolución sub-milisegundo.
 */
export function startSpan(layer: SpanLayer, name: string): SpanHandle {
  const context = getTraceContext();
  const spanId = randomUUID().slice(0, 8);
  const startedAt = new Date().toISOString();
  const t0 = performance.now();

  return {
    spanId,
    end(result: SpanResult = {}) {
      const span: Span = {
        traceId: context?.traceId ?? NO_TRACE_ID,
        spanId,
        parentSpanId: context?.parentSpanId,
        layer,
        name: result.name ?? name,
        startedAt,
        durationMs: Number((performance.now() - t0).toFixed(3)),
        status: result.status ?? "ok",
        ...(result.error !== undefined && { error: errorMessage(result.error) }),
        ...(result.meta && { meta: result.meta }),
      };
      sink.record(span);
    },
  };
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null)?.then === "function";
}

/**
 * Mide cuánto tarda `fn` y registra un span. Funciona con funciones síncronas y asíncronas,
 * devuelve exactamente lo mismo que `fn` y propaga sus errores sin alterarlos.
 *
 * Mientras `fn` se ejecuta, este span es el "padre" de cualquier otro span que se abra
 * dentro, de modo que la traza queda anidada (http -> service -> db).
 */
export function withTiming<T>(layer: SpanLayer, name: string, fn: () => T): T {
  const span = startSpan(layer, name);
  const traceId = getTraceContext()?.traceId ?? NO_TRACE_ID;

  let result: T;
  try {
    result = runWithTrace({ traceId, parentSpanId: span.spanId }, fn);
  } catch (error) {
    span.end({ status: "error", error });
    throw error;
  }

  if (isPromiseLike(result)) {
    return result.then(
      (value) => {
        span.end();
        return value;
      },
      (error: unknown) => {
        span.end({ status: "error", error });
        throw error;
      },
    ) as T;
  }

  span.end();
  return result;
}
