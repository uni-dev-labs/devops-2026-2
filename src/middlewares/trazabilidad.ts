import type { NextFunction, Request, Response } from "express";
import { performance } from "node:perf_hooks";

/**
 * Trazabilidad de tiempos por servicio (endpoint).
 * Mide cuánto tarda cada petición, lo agrega en memoria por "MÉTODO ruta"
 * y expone un resumen general (promedio, mínimo, máximo, p95 y total).
 */

type Registro = { llamadas: number; totalMs: number; minMs: number; maxMs: number; muestras: number[] };

const MAX_MUESTRAS = 1000;
const registros = new Map<string, Registro>();

function percentil(valores: number[], p: number): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const idx = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1);
  return ordenados[Math.max(0, idx)];
}

const r = (n: number) => Math.round(n * 1000) / 1000;

export function registrarTiempo(servicio: string, ms: number): void {
  const reg = registros.get(servicio) ?? { llamadas: 0, totalMs: 0, minMs: Infinity, maxMs: 0, muestras: [] };
  reg.llamadas += 1;
  reg.totalMs += ms;
  reg.minMs = Math.min(reg.minMs, ms);
  reg.maxMs = Math.max(reg.maxMs, ms);
  reg.muestras.push(ms);
  if (reg.muestras.length > MAX_MUESTRAS) reg.muestras.shift();
  registros.set(servicio, reg);
}

export function trazabilidad(req: Request, res: Response, next: NextFunction): void {
  const inicio = performance.now();

  res.on("finish", () => {
    const ms = performance.now() - inicio;
    // Usa la ruta declarada (p. ej. /api/products/:id) para agrupar; si no hay, la URL sin query.
    const ruta = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.originalUrl.split("?")[0];
    const servicio = `${req.method} ${ruta}`;
    registrarTiempo(servicio, ms);
    if (process.env.NODE_ENV !== "test") {
      console.log(`[trazabilidad] ${servicio} -> ${res.statusCode} en ${ms.toFixed(2)} ms`);
    }
  });

  // Cabecera para ver el tiempo desde el cliente (se fija antes de enviar el cuerpo).
  const writeHead = res.writeHead.bind(res);
  res.writeHead = ((...args: Parameters<typeof res.writeHead>) => {
    if (!res.headersSent) res.setHeader("X-Response-Time", `${(performance.now() - inicio).toFixed(2)}ms`);
    return writeHead(...args);
  }) as typeof res.writeHead;

  next();
}

export function resumenTrazabilidad() {
  const servicios = [...registros.entries()]
    .map(([servicio, reg]) => ({
      servicio,
      llamadas: reg.llamadas,
      promedioMs: r(reg.totalMs / reg.llamadas),
      minMs: r(reg.minMs),
      maxMs: r(reg.maxMs),
      p95Ms: r(percentil(reg.muestras, 95)),
      totalMs: r(reg.totalMs),
    }))
    .sort((a, b) => b.promedioMs - a.promedioMs);

  const llamadas = servicios.reduce((acc, s) => acc + s.llamadas, 0);
  const totalMs = servicios.reduce((acc, s) => acc + s.totalMs, 0);

  return {
    general: {
      servicios: servicios.length,
      llamadas,
      totalMs: r(totalMs),
      promedioGeneralMs: llamadas ? r(totalMs / llamadas) : 0,
      servicioMasLento: servicios[0]?.servicio ?? null,
      servicioMasRapido: servicios.at(-1)?.servicio ?? null,
    },
    servicios,
  };
}

export function reiniciarTrazabilidad(): void {
  registros.clear();
}
