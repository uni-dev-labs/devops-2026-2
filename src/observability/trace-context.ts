import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Contexto de la traza actual.
 *
 * AsyncLocalStorage mantiene este contexto a lo largo de toda la cadena de llamadas
 * (incluyendo await), así cualquier función puede saber a qué petición pertenece
 * sin que haya que pasar el traceId como parámetro por todas partes.
 */
export type TraceContext = {
  traceId: string;
  /** Span que está ejecutándose ahora mismo; será el "padre" de los spans que se abran dentro. */
  parentSpanId?: string;
};

const storage = new AsyncLocalStorage<TraceContext>();

export function runWithTrace<T>(context: TraceContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getTraceContext(): TraceContext | undefined {
  return storage.getStore();
}
