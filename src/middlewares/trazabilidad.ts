import type { NextFunction, Request, RequestHandler, Response } from "express";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

/**
 * Trazabilidad de tiempos por endpoint.
 *
 * Cada petición recibe un id de traza (X-Request-Id), se mide cuánto tarda
 * en responder (X-Response-Time) y el tiempo se acumula por "MÉTODO ruta".
 * El resumen se consulta en GET /api/trazabilidad.
 */

type Registro = {
  llamadas: number;
  errores: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  muestras: number[];
};

export type ResumenServicio = {
  servicio: string;
  llamadas: number;
  errores: number;
  promedioMs: number;
  minMs: number;
  maxMs: number;
  p95Ms: number;
  totalMs: number;
};

const MAX_MUESTRAS = 500;
const registros = new Map<string, Registro>();

const redondear = (n: number) => Math.round(n * 1000) / 1000;

function percentil(valores: number[], p: number): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * ordenados.length) - 1;
  return ordenados[Math.min(ordenados.length - 1, Math.max(0, idx))];
}

// Agrupa por la ruta declarada (/api/products/:id) para no crear una entrada por cada id.
function nombreServicio(req: Request): string {
  const ruta = req.route?.path
    ? `${req.baseUrl}${req.route.path === "/" ? "" : req.route.path}` || "/"
    : req.originalUrl.split("?")[0];
  return `${req.method} ${ruta}`;
}

export function registrarTiempo(servicio: string, ms: number, error = false): void {
  const reg = registros.get(servicio) ?? {
    llamadas: 0,
    errores: 0,
    totalMs: 0,
    minMs: Number.POSITIVE_INFINITY,
    maxMs: 0,
    muestras: [],
  };
  reg.llamadas += 1;
  if (error) reg.errores += 1;
  reg.totalMs += ms;
  reg.minMs = Math.min(reg.minMs, ms);
  reg.maxMs = Math.max(reg.maxMs, ms);
  reg.muestras.push(ms);
  if (reg.muestras.length > MAX_MUESTRAS) reg.muestras.shift();
  registros.set(servicio, reg);
}

export const trazabilidad: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const inicio = performance.now();
  const idRecibido = req.header("x-request-id");
  const requestId = idRecibido && idRecibido.length <= 100 ? idRecibido : randomUUID();
  res.setHeader("X-Request-Id", requestId);

  // X-Response-Time se fija justo antes de enviar las cabeceras.
  const writeHeadOriginal = res.writeHead.bind(res) as (...args: unknown[]) => Response;
  res.writeHead = ((...args: unknown[]) => {
    if (!res.headersSent) {
      res.setHeader("X-Response-Time", `${(performance.now() - inicio).toFixed(3)}ms`);
    }
    return writeHeadOriginal(...args);
  }) as typeof res.writeHead;

  res.on("finish", () => {
    const ms = performance.now() - inicio;
    const servicio = nombreServicio(req);
    if (servicio.endsWith("/api/trazabilidad")) return; // no medir la propia consulta de métricas
    registrarTiempo(servicio, ms, res.statusCode >= 500);
    if (process.env.NODE_ENV !== "test") {
      console.log(
        `[trazabilidad] ${requestId} ${servicio} -> ${res.statusCode} en ${ms.toFixed(2)} ms`,
      );
    }
  });

  next();
};

export function resumenTrazabilidad() {
  const servicios: ResumenServicio[] = [...registros.entries()]
    .map(([servicio, reg]) => ({
      servicio,
      llamadas: reg.llamadas,
      errores: reg.errores,
      promedioMs: redondear(reg.totalMs / reg.llamadas),
      minMs: redondear(reg.minMs),
      maxMs: redondear(reg.maxMs),
      p95Ms: redondear(percentil(reg.muestras, 95)),
      totalMs: redondear(reg.totalMs),
    }))
    .sort((a, b) => b.promedioMs - a.promedioMs);

  const llamadas = servicios.reduce((acc, s) => acc + s.llamadas, 0);
  const totalMs = servicios.reduce((acc, s) => acc + s.totalMs, 0);

  return {
    general: {
      servicios: servicios.length,
      llamadas,
      totalMs: redondear(totalMs),
      promedioMs: llamadas ? redondear(totalMs / llamadas) : 0,
      servicioMasLento: servicios[0]?.servicio ?? null,
      servicioMasRapido: servicios.at(-1)?.servicio ?? null,
    },
    servicios,
  };
}

export function reiniciarTrazabilidad(): void {
  registros.clear();
}
