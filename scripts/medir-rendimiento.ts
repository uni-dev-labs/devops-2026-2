/**
 * Mide cuánto tarda en ejecutarse cada método de ProductStore.
 * Uso: npm run rendimiento
 * Escribe los resultados en docs/rendimiento-product-store.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { ProductStore } from "../src/services/product-store.js";

type Result = {
  operation: string;
  iterations: number;
  mean: number;
  median: number;
  p95: number;
  min: number;
  max: number;
};

const STORE_SIZES = [100, 1000];
const ITERATIONS = 1000;
const LIST_ITERATIONS = 200;
const WARMUP = 50;
const CATEGORIES = ["Granos", "Bebidas", "Despensa", "Lacteos"];
const OUTPUT_FILE = "docs/rendimiento-product-store.md";

function seedStore(size: number): ProductStore {
  const store = new ProductStore();
  for (let i = 0; i < size; i += 1) {
    store.create({
      name: `Producto ${i}`,
      sku: `PRD-${i}`,
      price: (i % 500) * 100,
      stock: 10000,
      category: CATEGORIES[i % CATEGORIES.length],
    });
  }
  return store;
}

function percentile(sorted: number[], p: number): number {
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, index))]!;
}

function summarize(operation: string, samples: number[]): Result {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.reduce((sum, value) => sum + value, 0);
  return {
    operation,
    iterations: samples.length,
    mean: total / samples.length,
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
  };
}

function measure(
  operation: string,
  iterations: number,
  run: (i: number) => void,
  before?: (i: number) => void,
  after?: (i: number) => void,
): Result {
  for (let i = 0; i < WARMUP; i += 1) {
    before?.(i);
    run(i);
    after?.(i);
  }

  const samples: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    before?.(i);
    const start = performance.now();
    run(i);
    samples.push(performance.now() - start);
    after?.(i);
  }
  return summarize(operation, samples);
}

function measureStore(size: number): Result[] {
  const store = seedStore(size);
  const ids = store.list().map((product) => product.id);
  const idAt = (i: number): string => ids[i % ids.length]!;
  let tempId = "";

  return [
    measure(
      "create",
      ITERATIONS,
      (i) => {
        tempId = store.create({ name: `Temporal ${i}`, sku: `TMP-${i}`, price: 1000 }).id;
      },
      undefined,
      () => {
        store.remove(tempId);
      },
    ),
    measure("getById", ITERATIONS, (i) => {
      store.getById(idAt(i));
    }),
    measure("getBySku", ITERATIONS, (i) => {
      store.getBySku(`prd-${i % size}`);
    }),
    measure("list (sin filtros)", LIST_ITERATIONS, () => {
      store.list();
    }),
    measure("list (con filtros)", LIST_ITERATIONS, () => {
      store.list({ search: "producto 1", category: "Bebidas", active: true, minPrice: 1000, maxPrice: 30000 });
    }),
    measure("update", ITERATIONS, (i) => {
      store.update(idAt(i), { price: 1000 + (i % 2) });
    }),
    measure("adjustStock", ITERATIONS, (i) => {
      store.adjustStock(idAt(i), i % 2 === 0 ? 1 : -1);
    }),
    measure(
      "remove",
      ITERATIONS,
      () => {
        store.remove(tempId);
      },
      (i) => {
        tempId = store.create({ name: `Borrar ${i}`, sku: `DEL-${i}`, price: 1 }).id;
      },
    ),
  ];
}

function formatMs(value: number): string {
  return value.toFixed(4);
}

function formatOpsPerSecond(mean: number): string {
  return mean > 0 ? Math.round(1000 / mean).toLocaleString("es-CO") : "-";
}

function toTable(results: Result[]): string {
  const header = [
    "| Operación | Iteraciones | Promedio | Mediana | p95 | Mín | Máx | ops/s |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  const rows = results.map(
    (r) =>
      `| ${r.operation} | ${r.iterations} | ${formatMs(r.mean)} | ${formatMs(r.median)} | ${formatMs(r.p95)} | ${formatMs(r.min)} | ${formatMs(r.max)} | ${formatOpsPerSecond(r.mean)} |`,
  );
  return [...header, ...rows].join("\n");
}

const startedAt = performance.now();
const sections = STORE_SIZES.map(
  (size) => `## Almacén con ${size.toLocaleString("es-CO")} productos\n\n${toTable(measureStore(size))}`,
);
const totalSeconds = ((performance.now() - startedAt) / 1000).toFixed(2);

const report = [
  "# Tiempo de ejecución de ProductStore",
  "",
  `- Fecha: ${new Date().toISOString()}`,
  `- Node.js: ${process.version}`,
  `- Sistema: ${os.platform()} ${os.release()}`,
  `- CPU: ${os.cpus()[0]?.model ?? "desconocida"}`,
  `- Duración total de la medición: ${totalSeconds} s`,
  "",
  `Tiempos en milisegundos por llamada. Cada operación se ejecuta ${WARMUP} veces antes de medir.`,
  "Se genera con `npm run rendimiento`.",
  "",
  sections.join("\n\n"),
  "",
].join("\n");

mkdirSync("docs", { recursive: true });
writeFileSync(OUTPUT_FILE, report);
console.log(report);
console.log(`Resultados guardados en ${OUTPUT_FILE}`);
