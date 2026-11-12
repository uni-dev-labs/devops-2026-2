import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * Un "span" es un tramo medido dentro de una petición: una consulta a la base de datos,
 * el cálculo de la paginación, etc. Todos los spans de una petición comparten el mismo traceId.
 */
export type Span = {
  name: string;
  /** Milisegundos desde que empezó la petición hasta que empezó el span. */
  startMs: number;
  durationMs: number;
  status: "ok" | "error";
  error?: string;
};

export type Trace = {
  traceId: string;
  method: string;
  path: string;
  statusCode?: number;
  startedAt: string;
  durationMs?: number;
  spans: Span[];
};

type ActiveTrace = { trace: Trace; origin: number };

const storage = new AsyncLocalStorage<ActiveTrace>();

// Acepta un id entrante (de otro servicio o del cliente) solo si es seguro de reenviar.
const TRACE_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

export function resolveTraceId(incoming: unknown): string {
  return typeof incoming === "string" && TRACE_ID_PATTERN.test(incoming) ? incoming : randomUUID();
}

/** Ejecuta `fn` con una traza activa; todo lo que corra dentro (aunque sea asíncrono) la ve. */
export function runWithTrace<T>(trace: Trace, origin: number, fn: () => T): T {
  return storage.run({ trace, origin }, fn);
}

export function currentTrace(): ActiveTrace | undefined {
  return storage.getStore();
}

export function currentTraceId(): string | undefined {
  return storage.getStore()?.trace.traceId;
}
