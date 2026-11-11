/**
 * Utilidades compartidas por las mediciones de rendimiento.
 * Calculan estadísticas sobre los tiempos medidos y escriben los reportes
 * (JSON para los artefactos y Markdown para el resumen del job en GitHub Actions).
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const CARPETA_RESULTADOS = path.resolve("perf/resultados");

export type Estadisticas = {
  muestras: number;
  totalMs: number;
  promedioMs: number;
  minMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  opsPorSegundo: number;
};

/** Percentil por rango más cercano sobre un arreglo ya ordenado. */
export function percentil(ordenado: number[], p: number): number {
  if (ordenado.length === 0) return Number.NaN;
  const indice = Math.ceil((p / 100) * ordenado.length) - 1;
  return ordenado[Math.min(ordenado.length - 1, Math.max(0, indice))]!;
}

/**
 * Resume una lista de duraciones (ms).
 * `duracionTotalMs` es el tiempo de pared de toda la medición; con concurrencia
 * es menor que la suma de las duraciones, y de ahí sale el throughput real.
 */
export function resumir(duracionesMs: number[], duracionTotalMs: number): Estadisticas {
  const ordenado = [...duracionesMs].sort((a, b) => a - b);
  const suma = ordenado.reduce((acc, valor) => acc + valor, 0);
  return {
    muestras: ordenado.length,
    totalMs: duracionTotalMs,
    promedioMs: ordenado.length ? suma / ordenado.length : Number.NaN,
    minMs: ordenado[0] ?? Number.NaN,
    p50Ms: percentil(ordenado, 50),
    p95Ms: percentil(ordenado, 95),
    p99Ms: percentil(ordenado, 99),
    maxMs: ordenado.at(-1) ?? Number.NaN,
    opsPorSegundo: duracionTotalMs > 0 ? (ordenado.length / duracionTotalMs) * 1000 : Number.NaN,
  };
}

/** Formatea una duración en ms con la unidad más legible (µs o ms). */
export function duracion(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  if (ms < 1) return `${(ms * 1000).toFixed(2)} µs`;
  if (ms < 1000) return `${ms.toFixed(2)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** Entero con espacio como separador de miles (175 411), para no confundirlo con decimales. */
export function entero(valor: number): string {
  if (!Number.isFinite(valor)) return "—";
  return String(Math.round(valor)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function tablaMarkdown(encabezados: string[], filas: (string | number)[][]): string {
  const linea = (celdas: (string | number)[]) => `| ${celdas.map(String).join(" | ")} |`;
  return [linea(encabezados), linea(encabezados.map(() => "---")), ...filas.map(linea)].join("\n");
}

/** Datos del entorno para que cada medición sea trazable a un commit, un runner y una versión de Node. */
export function contexto(): Record<string, string> {
  const cpus = os.cpus();
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  return {
    commit: (process.env.GITHUB_SHA ?? "local").slice(0, 7),
    rama: process.env.GITHUB_REF_NAME ?? "local",
    corrida: repo && runId ? `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${runId}` : "local",
    node: process.version,
    so: `${os.type()} ${os.release()} (${os.arch()})`,
    cpu: `${cpus[0]?.model?.trim() ?? "desconocida"} × ${cpus.length}`,
    memoria: `${(os.totalmem() / 1024 ** 3).toFixed(1)} GiB`,
    fecha: new Date().toISOString(),
  };
}

export function guardarJson(nombre: string, datos: unknown): string {
  mkdirSync(CARPETA_RESULTADOS, { recursive: true });
  const ruta = path.join(CARPETA_RESULTADOS, nombre);
  writeFileSync(ruta, `${JSON.stringify(datos, null, 2)}\n`);
  return ruta;
}

/** Guarda el Markdown como archivo y, en GitHub Actions, lo agrega al resumen del job. */
export function publicarMarkdown(nombre: string, markdown: string): void {
  mkdirSync(CARPETA_RESULTADOS, { recursive: true });
  writeFileSync(path.join(CARPETA_RESULTADOS, nombre), `${markdown}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }
}
