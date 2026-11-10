import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import os from "node:os";
import process from "node:process";
import { ProductStore } from "../src/services/product-store.js";

type Batch = () => void;

type Result = {
  operation: string;
  measuredCallsPerBatch: number;
  medianMicrosecondsPerCall: number;
  meanMicrosecondsPerCall: number;
  p95MicrosecondsPerCall: number;
  medianCallsPerSecond: number;
};

const batches = 9;
const warmupBatches = 2;
const commonDatasetSize = 500;

function seedStore(size: number) {
  const store = new ProductStore();
  const ids: string[] = [];
  const skus: string[] = [];

  for (let i = 0; i < size; i += 1) {
    const product = store.create({
      name: `Producto ${i.toString().padStart(4, "0")}`,
      sku: `SKU-${i}`,
      price: i + 0.5,
      stock: i,
      category: i % 2 === 0 ? "Abarrotes" : "Bebidas",
    });
    ids.push(product.id);
    skus.push(product.sku);
  }

  return { store, ids, skus };
}

function percentile(sorted: number[], proportion: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * proportion) - 1)]!;
}

function measure(operation: string, calls: number, prepareBatch: () => Batch): Result {
  for (let batch = 0; batch < warmupBatches; batch += 1) {
    prepareBatch()();
  }

  const samples: number[] = [];
  for (let batch = 0; batch < batches; batch += 1) {
    const run = prepareBatch();
    const start = performance.now();
    run();
    samples.push(((performance.now() - start) * 1000) / calls);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const median = percentile(sorted, 0.5);
  const mean = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;

  return {
    operation,
    measuredCallsPerBatch: calls,
    medianMicrosecondsPerCall: Number(median.toFixed(3)),
    meanMicrosecondsPerCall: Number(mean.toFixed(3)),
    p95MicrosecondsPerCall: Number(percentile(sorted, 0.95).toFixed(3)),
    medianCallsPerSecond: Math.round(1_000_000 / median),
  };
}

const common = seedStore(commonDatasetSize);
const targetId = common.ids[commonDatasetSize - 1]!;
const targetSku = common.skus[commonDatasetSize - 1]!;
const updateId = common.ids[0]!;
let updateActive = false;
let stockDelta = 1;

const results = [
  measure("create", 1_000, () => {
    const stores = Array.from({ length: 1_000 }, () => new ProductStore());
    return () => {
      for (let i = 0; i < stores.length; i += 1) {
        stores[i]!.create({ name: "Producto nuevo", sku: `NEW-${i}`, price: 1 });
      }
    };
  }),
  measure("getById", 10_000, () => () => {
    for (let i = 0; i < 10_000; i += 1) common.store.getById(targetId);
  }),
  measure("getBySku (último de 500)", 2_000, () => () => {
    for (let i = 0; i < 2_000; i += 1) common.store.getBySku(targetSku);
  }),
  measure("list (500 productos)", 100, () => () => {
    for (let i = 0; i < 100; i += 1) common.store.list({ category: "Abarrotes" });
  }),
  measure("update", 5_000, () => () => {
    for (let i = 0; i < 5_000; i += 1) {
      updateActive = !updateActive;
      common.store.update(updateId, { active: updateActive });
    }
  }),
  measure("remove", 500, () => {
    const { store, ids } = seedStore(500);
    return () => {
      for (const id of ids) store.remove(id);
    };
  }),
  measure("adjustStock", 5_000, () => () => {
    for (let i = 0; i < 5_000; i += 1) {
      common.store.adjustStock(updateId, stockDelta);
      stockDelta = -stockDelta;
    }
  }),
];

const report = {
  title: "Medición de rendimiento de ProductStore",
  generatedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: `${os.platform()} ${os.release()} (${os.arch()})`,
  },
  method: {
    batches,
    warmupBatches,
    datasetSize: commonDatasetSize,
    summary: "Medianas, promedios y p95 calculados sobre nueve tiempos por lote; las llamadas se agrupan para reducir el ruido del cronómetro.",
    units: "microsegundos por llamada; operaciones en memoria, sin PostgreSQL/MongoDB ni HTTP",
  },
  results,
};

console.log("Medición de rendimiento de ProductStore");
console.log(`Node ${report.environment.node} | ${report.environment.platform}`);
console.log("Dataset: 500 productos; 2 lotes de calentamiento y 9 lotes medidos por operación.");
console.table(results);

const outputPath = process.env.BENCH_OUTPUT;
if (outputPath) {
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Reporte JSON: ${outputPath}`);
}
