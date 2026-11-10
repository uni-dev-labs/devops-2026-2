import { performance } from "node:perf_hooks";

export const ITERATIONS = Number(process.env.ITERATIONS) || 200;
export const SERVICE_ITERATIONS = Number(process.env.SERVICE_ITERATIONS) || 10_000;

export type BenchRow = {
  group: string;
  name: string;
  runs: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p95Ms: number;
};
export type BenchSkip = { group: string; name: string; reason: string };
export type BenchResult = { rows: BenchRow[]; skipped: BenchSkip[] };

export function createBench(group: string) {
  const result: BenchResult = { rows: [], skipped: [] };

  // Ejecuta fn `runs` veces (más una de calentamiento) y guarda los tiempos.
  async function measure(name: string, runs: number, fn: (i: number) => unknown | Promise<unknown>) {
    await fn(-1);
    const times: number[] = [];
    const start = performance.now();
    for (let i = 0; i < runs; i++) {
      const t = performance.now();
      await fn(i);
      times.push(performance.now() - t);
    }
    const totalMs = performance.now() - start;
    times.sort((a, b) => a - b);
    result.rows.push({
      group,
      name,
      runs,
      totalMs,
      avgMs: totalMs / runs,
      minMs: times[0],
      maxMs: times[times.length - 1],
      p95Ms: times[Math.min(times.length - 1, Math.floor(times.length * 0.95))],
    });
  }

  // Si el bloque falla (p. ej. la DB no está disponible), lo marca como SKIP y sigue.
  async function section(name: string, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (error) {
      result.skipped.push({ group, name, reason: error instanceof Error ? error.message || error.name : String(error) });
    }
  }

  return { measure, section, result };
}

export function printReport(results: BenchResult[]) {
  const f = (n: number) => n.toFixed(3);
  console.log(`\n## Resultados (iteraciones: ${ITERATIONS} db/routes, ${SERVICE_ITERATIONS} services)\n`);
  console.log("| Grupo | Prueba | Corridas | Total (ms) | Promedio (ms) | Mín (ms) | Máx (ms) | p95 (ms) |");
  console.log("|---|---|---:|---:|---:|---:|---:|---:|");
  for (const { rows } of results) {
    for (const r of rows) {
      console.log(`| ${r.group} | ${r.name} | ${r.runs} | ${f(r.totalMs)} | ${f(r.avgMs)} | ${f(r.minMs)} | ${f(r.maxMs)} | ${f(r.p95Ms)} |`);
    }
  }
  const skipped = results.flatMap((r) => r.skipped);
  if (skipped.length) {
    console.log("\nOmitidas (SKIP):");
    for (const s of skipped) console.log(`- ${s.group}/${s.name}: ${s.reason}`);
  }
}
