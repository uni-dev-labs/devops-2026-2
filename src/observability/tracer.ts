import { performance } from "node:perf_hooks";
import { currentTrace, type Span } from "./trace-context.js";

function record(name: string, start: number, error?: unknown): void {
  const active = currentTrace();
  if (!active) return; // fuera de una petición (tests unitarios, arranque) no se guarda nada

  const span: Span = {
    name,
    startMs: round(start - active.origin),
    durationMs: round(performance.now() - start),
    status: error === undefined ? "ok" : "error",
  };
  if (error !== undefined) span.error = error instanceof Error ? error.message : String(error);
  active.trace.spans.push(span);
}

/**
 * Mide `fn` como un span de la petición actual. Funciona con funciones síncronas y asíncronas,
 * y si `fn` lanza un error lo registra como span fallido y lo vuelve a lanzar sin cambiarlo.
 */
export function withSpan<T>(name: string, fn: () => T): T {
  const start = performance.now();
  let result: T;
  try {
    result = fn();
  } catch (error) {
    record(name, start, error);
    throw error;
  }

  if (result instanceof Promise) {
    return result.then(
      (value) => {
        record(name, start);
        return value;
      },
      (error: unknown) => {
        record(name, start, error);
        throw error;
      },
    ) as T;
  }

  record(name, start);
  return result;
}

export function round(ms: number): number {
  return Math.round(ms * 1000) / 1000;
}
