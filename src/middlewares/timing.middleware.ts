import type { NextFunction, Request, Response } from "express";

/**
 * Trazabilidad de tiempos de respuesta.
 *
 * Mide cuánto se demora cada servicio (método + ruta) en responder,
 * lo deja en un log por petición, lo devuelve en el header X-Response-Time
 * y acumula estadísticas para calcular un resumen general.
 */

export type ServiceStats = {
  service: string;
  count: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  lastMs: number;
};

export type MetricsSummary = {
  general: {
    totalRequests: number;
    totalMs: number;
    avgMs: number;
    minMs: number;
    maxMs: number;
  };
  services: ServiceStats[];
};

type Accumulator = {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  lastMs: number;
};

const stats = new Map<string, Accumulator>();

const round = (n: number) => Math.round(n * 100) / 100;

// Agrupa por la ruta declarada (/api/products/:id) y no por la URL real,
// así /api/products/1 y /api/products/2 cuentan como el mismo servicio.
function serviceName(req: Request): string {
  const route = req.route?.path as string | undefined;
  const path = route !== undefined ? `${req.baseUrl}${route === "/" ? "" : route}` || "/" : req.path;
  return `${req.method} ${path}`;
}

export function recordTiming(service: string, durationMs: number): void {
  const current = stats.get(service);
  if (!current) {
    stats.set(service, {
      count: 1,
      totalMs: durationMs,
      minMs: durationMs,
      maxMs: durationMs,
      lastMs: durationMs,
    });
    return;
  }

  current.count += 1;
  current.totalMs += durationMs;
  current.minMs = Math.min(current.minMs, durationMs);
  current.maxMs = Math.max(current.maxMs, durationMs);
  current.lastMs = durationMs;
}

export function getMetrics(): MetricsSummary {
  const services: ServiceStats[] = [...stats.entries()]
    .map(([service, s]) => ({
      service,
      count: s.count,
      totalMs: round(s.totalMs),
      avgMs: round(s.totalMs / s.count),
      minMs: round(s.minMs),
      maxMs: round(s.maxMs),
      lastMs: round(s.lastMs),
    }))
    .sort((a, b) => b.avgMs - a.avgMs);

  const all = [...stats.values()];
  const totalRequests = all.reduce((sum, s) => sum + s.count, 0);
  const totalMs = all.reduce((sum, s) => sum + s.totalMs, 0);

  return {
    general: {
      totalRequests,
      totalMs: round(totalMs),
      avgMs: totalRequests ? round(totalMs / totalRequests) : 0,
      minMs: all.length ? round(Math.min(...all.map((s) => s.minMs))) : 0,
      maxMs: all.length ? round(Math.max(...all.map((s) => s.maxMs))) : 0,
    },
    services,
  };
}

export function resetMetrics(): void {
  stats.clear();
}

export function timingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  // Header con la duración, puesto justo antes de enviar la respuesta.
  const originalWriteHead = res.writeHead;
  res.writeHead = function (this: Response, ...args: Parameters<Response["writeHead"]>) {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    if (!res.headersSent) res.setHeader("X-Response-Time", `${ms.toFixed(2)}ms`);
    return originalWriteHead.apply(this, args);
  } as Response["writeHead"];

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const service = serviceName(req);
    if (service.endsWith(" /api/metrics")) return; // no medir el propio endpoint de métricas
    recordTiming(service, durationMs);

    if (process.env.NODE_ENV !== "test") {
      console.log(`[timing] ${service} -> ${res.statusCode} en ${durationMs.toFixed(2)}ms`);
    }
  });

  next();
}
