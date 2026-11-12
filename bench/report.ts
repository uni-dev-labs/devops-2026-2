import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BenchResult } from "vitest";

/**
 * Guarda los resultados de un grupo de benchmarks en reports/bench/<etiqueta>/<grupo>.json.
 * La etiqueta (BENCH_LABEL) permite comparar dos corridas, por ejemplo "antes" y "despues"
 * de una optimización, con `npm run bench:report`.
 */
export type BenchRow = {
  name: string;
  opsPerSec: number;
  meanUs: number;
  p50Us: number;
  p99Us: number;
  rmePct: number;
  samples: number;
};

const us = (ms: number) => Math.round(ms * 1000 * 1000) / 1000;

export function toRow(result: BenchResult): BenchRow {
  return {
    name: result.name,
    opsPerSec: Math.round(result.throughput.mean),
    meanUs: us(result.latency.mean),
    p50Us: us(result.latency.p50 ?? result.latency.mean),
    p99Us: us(result.latency.p99),
    rmePct: Math.round(result.latency.rme * 100) / 100,
    samples: result.latency.samplesCount,
  };
}

export function saveGroup(group: string, names: string[], storage: { get: (name: string) => BenchResult }) {
  const label = process.env.BENCH_LABEL || "actual";
  const dir = join("reports", "bench", label);
  mkdirSync(dir, { recursive: true });

  const rows = names.map((n) => toRow(storage.get(n)));
  const file = group.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  writeFileSync(
    join(dir, `${file}.json`),
    JSON.stringify({ group, label, node: process.version, date: new Date().toISOString(), rows }, null, 2),
  );
}

/** Tiempo por benchmark: suficiente para estabilizar el resultado sin que la corrida tarde minutos. */
export const RUN = { time: 400, warmupTime: 100 };
