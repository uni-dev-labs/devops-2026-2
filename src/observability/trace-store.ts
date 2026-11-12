import type { Trace } from "./trace-context.js";

/**
 * Guarda en memoria las últimas N trazas (buffer circular) para poder consultarlas por
 * traceId desde GET /api/traces. Es para diagnóstico: no reemplaza a una herramienta como
 * Jaeger o Grafana Tempo, pero muestra la misma idea sin dependencias externas.
 */
export class TraceStore {
  private readonly items: Trace[] = [];

  constructor(private readonly capacity: number) {}

  add(trace: Trace): void {
    this.items.push(trace);
    if (this.items.length > this.capacity) this.items.shift();
  }

  get(traceId: string): Trace | undefined {
    return this.items.find((t) => t.traceId === traceId);
  }

  /** Las más recientes primero. */
  recent(limit = 20): Trace[] {
    return this.items.slice(-limit).reverse();
  }

  get size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items.length = 0;
  }
}
