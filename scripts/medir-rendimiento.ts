/**
 * Trazabilidad: mide cuánto tarda en ejecutarse cada operación de ProductStore.
 *
 * Uso:
 *   npm run perf:productos
 *
 * Para cada tamaño de almacén (100, 1.000 y 10.000 productos) cronometra cada
 * llamada con performance.now() y calcula promedio, mediana, p95, mínimo y máximo.
 * Imprime una tabla en consola y guarda el resultado en reports/trazabilidad/
 * como .csv (datos) y .md (informe legible).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { ProductStore, type Product } from "../src/services/product-store.js";

const SIZES = [100, 1_000, 10_000];
const ITERATIONS = 1_000; // operaciones puntuales (get, update, ...)
const WARMUP = 50; // llamadas previas que no se cuentan (calientan el JIT)

type Row = {
  size: number;
  operation: string;
  iterations: number;
  avgMs: number;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  opsPerSec: number;
};

function listIterations(size: number): number {
  return size <= 1_000 ? 200 : 30;
}

function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
}

/** Cronometra `iterations` llamadas a `run(i)` y devuelve las estadísticas. */
function measure(
  size: number,
  operation: string,
  iterations: number,
  run: (i: number) => void,
  warmup = WARMUP,
): Row {
  for (let i = 0; i < warmup; i++) run(i);

  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    run(warmup + i);
    samples.push(performance.now() - start);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.reduce((sum, ms) => sum + ms, 0);
  const avgMs = total / samples.length;

  return {
    size,
    operation,
    iterations,
    avgMs,
    medianMs: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    minMs: sorted[0]!,
    maxMs: sorted[sorted.length - 1]!,
    opsPerSec: avgMs > 0 ? 1000 / avgMs : Infinity,
  };
}

const CATEGORIES = ["Granos", "Bebidas", "Despensa", "Aseo", "Lácteos"];

/** Crea un almacén con `size` productos de prueba. */
function seed(size: number): { store: ProductStore; products: Product[] } {
  const store = new ProductStore();
  const products: Product[] = [];
  for (let i = 0; i < size; i++) {
    products.push(
      store.create({
        name: `Producto ${i}`,
        sku: `SEED-${i}`,
        price: (i % 500) * 100,
        stock: 10,
        category: CATEGORIES[i % CATEGORIES.length],
      }),
    );
  }
  return { store, products };
}

function benchmarkSize(size: number): Row[] {
  const rows: Row[] = [];
  // Paso primo: reparte las consultas por todo el almacén, no solo los primeros productos
  const pick = (products: Product[], i: number) => products[(i * 7919) % products.length]!;

  // create: cada medición agrega un producto nuevo sobre un almacén de `size`
  {
    const { store } = seed(size);
    rows.push(
      measure(size, "create", ITERATIONS, (i) => {
        store.create({ name: `Nuevo ${i}`, sku: `NEW-${i}`, price: 1000, stock: 1 });
      }),
    );
  }

  const { store, products } = seed(size);

  rows.push(measure(size, "getById", ITERATIONS, (i) => void store.getById(pick(products, i).id)));
  rows.push(measure(size, "getBySku", ITERATIONS, (i) => void store.getBySku(pick(products, i).sku)));

  const listN = listIterations(size);
  rows.push(measure(size, "list (sin filtros)", listN, () => void store.list(), 5));
  rows.push(
    measure(
      size,
      "list (search + category + precio)",
      listN,
      () => void store.list({ search: "producto 1", category: "granos", minPrice: 0, maxPrice: 20_000 }),
      5,
    ),
  );

  rows.push(
    measure(size, "update", ITERATIONS, (i) => {
      store.update(pick(products, i).id, { price: 1000 + (i % 2) });
    }),
  );
  rows.push(
    measure(size, "adjustStock", ITERATIONS, (i) => {
      // Cada producto alterna +1 / -1 en cada vuelta, así el stock nunca baja de 10
      const product = products[i % products.length]!;
      const round = Math.floor(i / products.length);
      store.adjustStock(product.id, round % 2 === 0 ? 1 : -1);
    }),
  );

  // remove: se borran productos extra creados solo para esto
  {
    const extra: Product[] = [];
    for (let i = 0; i < ITERATIONS + WARMUP; i++) {
      extra.push(store.create({ name: `Borrar ${i}`, sku: `DEL-${i}`, price: 1 }));
    }
    rows.push(measure(size, "remove", ITERATIONS, (i) => void store.remove(extra[i]!.id)));
  }

  return rows;
}

function fmt(ms: number): string {
  return ms.toFixed(4);
}

function toCsv(rows: Row[]): string {
  const header = "tamano,operacion,iteraciones,promedio_ms,mediana_ms,p95_ms,min_ms,max_ms,ops_por_seg";
  const lines = rows.map((r) =>
    [
      r.size,
      `"${r.operation}"`,
      r.iterations,
      fmt(r.avgMs),
      fmt(r.medianMs),
      fmt(r.p95Ms),
      fmt(r.minMs),
      fmt(r.maxMs),
      Math.round(r.opsPerSec),
    ].join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}

function toMarkdown(rows: Row[], startedAt: Date, totalMs: number): string {
  const cpu = cpus()[0]?.model.trim() ?? "desconocida";
  const lines: string[] = [
    "# Trazabilidad: tiempo de ejecución de ProductStore",
    "",
    `- Fecha: ${startedAt.toISOString()}`,
    `- Node.js: ${process.version}`,
    `- Sistema: ${platform()} ${release()}`,
    `- CPU: ${cpu} (${cpus().length} hilos)`,
    `- RAM: ${(totalmem() / 1024 ** 3).toFixed(1)} GB`,
    `- Duración total de la medición: ${(totalMs / 1000).toFixed(2)} s`,
    "",
    "Tiempos en milisegundos por llamada. Cada operación se calienta antes de medir.",
    "",
  ];

  for (const size of SIZES) {
    lines.push(`## Almacén con ${size.toLocaleString("es-CO")} productos`, "");
    lines.push("| Operación | Iteraciones | Promedio | Mediana | p95 | Mín | Máx | ops/s |");
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const r of rows.filter((row) => row.size === size)) {
      lines.push(
        `| ${r.operation} | ${r.iterations} | ${fmt(r.avgMs)} | ${fmt(r.medianMs)} | ${fmt(r.p95Ms)} | ${fmt(r.minMs)} | ${fmt(r.maxMs)} | ${Math.round(r.opsPerSec).toLocaleString("es-CO")} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function main(): void {
  const startedAt = new Date();
  const t0 = performance.now();

  const rows: Row[] = [];
  for (const size of SIZES) {
    console.log(`Midiendo con ${size} productos...`);
    rows.push(...benchmarkSize(size));
  }
  const totalMs = performance.now() - t0;

  console.table(
    rows.map((r) => ({
      productos: r.size,
      operacion: r.operation,
      "promedio ms": fmt(r.avgMs),
      "p95 ms": fmt(r.p95Ms),
      "ops/s": Math.round(r.opsPerSec),
    })),
  );

  const dir = join("reports", "trazabilidad");
  mkdirSync(dir, { recursive: true });
  const stamp = startedAt.toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  const csvPath = join(dir, `rendimiento-${stamp}.csv`);
  const mdPath = join(dir, `rendimiento-${stamp}.md`);
  writeFileSync(csvPath, toCsv(rows), "utf8");
  writeFileSync(mdPath, toMarkdown(rows, startedAt, totalMs), "utf8");

  console.log(`\nMedición completa en ${(totalMs / 1000).toFixed(2)} s`);
  console.log(`Resultados: ${csvPath}`);
  console.log(`Informe:    ${mdPath}`);
}

main();
