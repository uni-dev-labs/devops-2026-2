/**
 * Modelo de datos de la trazabilidad y los destinos (sinks) donde se registran los tiempos.
 *
 * Un "span" es la medición de una unidad de trabajo (una petición HTTP, una función de
 * servicio, una consulta a la base de datos). Los spans de una misma petición comparten
 * `traceId`, y `parentSpanId` indica quién llamó a quién.
 */

export type SpanLayer = "http" | "service" | "db";
export type SpanStatus = "ok" | "error";

export type Span = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  layer: SpanLayer;
  name: string;
  startedAt: string; // ISO 8601
  durationMs: number;
  status: SpanStatus;
  error?: string;
  meta?: Record<string, string | number>;
};

/**
 * Contrato del destino de las mediciones.
 * Quien mide (withTiming, el middleware) depende de esta interfaz y no de console.log,
 * así se puede cambiar el destino (archivo, Prometheus...) sin tocar la lógica de medición.
 */
export interface TimingSink {
  record(span: Span): void;
}

/** Escribe cada span como una línea JSON: fácil de leer y de filtrar por traceId. */
export class ConsoleTimingSink implements TimingSink {
  record(span: Span): void {
    console.log(JSON.stringify({ type: "span", ...span }));
  }
}

/** No hace nada: se usa cuando la trazabilidad está desactivada. */
export class NoopTimingSink implements TimingSink {
  record(_span: Span): void {
    // intencionalmente vacío
  }
}

/** Guarda los spans en memoria. Pensado para tests. */
export class InMemoryTimingSink implements TimingSink {
  readonly spans: Span[] = [];

  record(span: Span): void {
    this.spans.push(span);
  }

  clear(): void {
    this.spans.length = 0;
  }
}
