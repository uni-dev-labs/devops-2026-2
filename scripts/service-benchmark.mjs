#!/usr/bin/env node
/**
 * Benchmark y Análisis de Recursos del Servicio y Almacén de Productos
 *
 * Mide:
 *  - Latencia por operación (min, avg, p95, max) en milisegundos.
 *  - Throughput (operaciones por segundo / ops/sec).
 *  - Consumo de recursos del proceso Node.js (CPU user/system, Heap y RSS).
 *
 * Uso:
 *   node scripts/service-benchmark.mjs
 *   npm run benchmark:service
 */

import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { ProductStore } from "../dist/services/product-store.js";
import { createApp } from "../dist/app.js";
import request from "supertest";

function formatBytes(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

function calculateStats(latenciesMs) {
  if (latenciesMs.length === 0) return { min: 0, avg: 0, p95: 0, max: 0 };
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const avg = sum / sorted.length;
  const p95Idx = Math.floor(sorted.length * 0.95);
  const p95 = sorted[p95Idx];
  return { min, avg, p95, max };
}

async function runBenchmark() {
  console.log("================================================================================");
  console.log("   BENCHMARK DE RENDIMIENTO Y CONSUMO DE RECURSOS - SERVICIO DEVOPS");
  console.log("================================================================================\n");

  const initialMemory = process.memoryUsage();
  const initialCpu = process.cpuUsage();
  const globalStart = performance.now();

  const store = new ProductStore();
  const benchmarkResults = {
    timestamp: new Date().toISOString(),
    environment: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
    },
    sections: {},
  };

  // -------------------------------------------------------------------------
  // 1. Inserción / Creación masiva (ProductStore.create)
  // -------------------------------------------------------------------------
  const CREATE_COUNT = 1000;
  const createLatencies = [];
  const createdIds = [];
  const createdSkus = [];
  const categories = ["Electrónica", "Hogar", "Ropa", "Libros", "Deportes"];

  for (let i = 0; i < CREATE_COUNT; i++) {
    const sku = `SKU-BENCH-${String(i).padStart(5, "0")}`;
    const name = `Producto de Prueba ${i} Edición Especial`;
    const cat = categories[i % categories.length];
    const price = Math.round((10 + (i % 100) * 2.5) * 100) / 100;
    const stock = 10 + (i % 50);

    const t0 = performance.now();
    const p = store.create({ name, sku, price, stock, category: cat });
    const t1 = performance.now();

    createLatencies.push(t1 - t0);
    createdIds.push(p.id);
    createdSkus.push(p.sku);
  }

  const createStats = calculateStats(createLatencies);
  const createTotalTime = createLatencies.reduce((a, b) => a + b, 0);
  const createThroughput = Math.round((CREATE_COUNT / (createTotalTime / 1000)));

  benchmarkResults.sections["create"] = {
    count: CREATE_COUNT,
    totalTimeMs: createTotalTime,
    throughputOpsSec: createThroughput,
    ...createStats,
  };

  // -------------------------------------------------------------------------
  // 2. Búsquedas indexadas (ProductStore.getById y getBySku)
  // -------------------------------------------------------------------------
  const READ_COUNT = 5000;
  const readLatencies = [];

  for (let i = 0; i < READ_COUNT; i++) {
    const isById = i % 2 === 0;
    const t0 = performance.now();
    if (isById) {
      const id = createdIds[i % createdIds.length];
      store.getById(id);
    } else {
      const sku = createdSkus[i % createdSkus.length];
      store.getBySku(sku);
    }
    const t1 = performance.now();
    readLatencies.push(t1 - t0);
  }

  const readStats = calculateStats(readLatencies);
  const readTotalTime = readLatencies.reduce((a, b) => a + b, 0);
  const readThroughput = Math.round((READ_COUNT / (readTotalTime / 1000)));

  benchmarkResults.sections["lookups"] = {
    count: READ_COUNT,
    totalTimeMs: readTotalTime,
    throughputOpsSec: readThroughput,
    ...readStats,
  };

  // -------------------------------------------------------------------------
  // 3. Consultas complejas con filtros y ordenamiento locale (ProductStore.list)
  // -------------------------------------------------------------------------
  const QUERY_COUNT = 500;
  const queryLatencies = [];

  for (let i = 0; i < QUERY_COUNT; i++) {
    const cat = categories[i % categories.length];
    const minPrice = 20;
    const maxPrice = 150;
    const search = i % 2 === 0 ? "Prueba" : "Edición";

    const t0 = performance.now();
    store.list({ search, category: cat, minPrice, maxPrice, active: true });
    const t1 = performance.now();
    queryLatencies.push(t1 - t0);
  }

  const queryStats = calculateStats(queryLatencies);
  const queryTotalTime = queryLatencies.reduce((a, b) => a + b, 0);
  const queryThroughput = Math.round((QUERY_COUNT / (queryTotalTime / 1000)));

  benchmarkResults.sections["list_queries"] = {
    count: QUERY_COUNT,
    totalTimeMs: queryTotalTime,
    throughputOpsSec: queryThroughput,
    ...queryStats,
  };

  // -------------------------------------------------------------------------
  // 4. Actualizaciones de stock (ProductStore.adjustStock)
  // -------------------------------------------------------------------------
  const ADJUST_COUNT = 2000;
  const adjustLatencies = [];

  for (let i = 0; i < ADJUST_COUNT; i++) {
    const id = createdIds[i % createdIds.length];
    const delta = (i % 2 === 0 ? 5 : -2);

    const t0 = performance.now();
    store.adjustStock(id, delta);
    const t1 = performance.now();
    adjustLatencies.push(t1 - t0);
  }

  const adjustStats = calculateStats(adjustLatencies);
  const adjustTotalTime = adjustLatencies.reduce((a, b) => a + b, 0);
  const adjustThroughput = Math.round((ADJUST_COUNT / (adjustTotalTime / 1000)));

  benchmarkResults.sections["adjust_stock"] = {
    count: ADJUST_COUNT,
    totalTimeMs: adjustTotalTime,
    throughputOpsSec: adjustThroughput,
    ...adjustStats,
  };

  // -------------------------------------------------------------------------
  // 5. Pruebas de servicio HTTP (Express App Endpoints)
  // -------------------------------------------------------------------------
  const app = createApp();
  const HTTP_COUNT = 200;
  const httpHealthLatencies = [];

  for (let i = 0; i < HTTP_COUNT; i++) {
    const t0 = performance.now();
    await request(app).get("/health");
    const t1 = performance.now();
    httpHealthLatencies.push(t1 - t0);
  }

  const httpStats = calculateStats(httpHealthLatencies);
  const httpTotalTime = httpHealthLatencies.reduce((a, b) => a + b, 0);
  const httpThroughput = Math.round((HTTP_COUNT / (httpTotalTime / 1000)));

  benchmarkResults.sections["http_health"] = {
    count: HTTP_COUNT,
    totalTimeMs: httpTotalTime,
    throughputOpsSec: httpThroughput,
    ...httpStats,
  };

  // -------------------------------------------------------------------------
  // Medición de Recursos Globales
  // -------------------------------------------------------------------------
  const finalCpu = process.cpuUsage(initialCpu);
  const finalMemory = process.memoryUsage();
  const globalDuration = performance.now() - globalStart;

  const totalCpuTimeMs = (finalCpu.user + finalCpu.system) / 1000;
  const userCpuTimeMs = finalCpu.user / 1000;
  const sysCpuTimeMs = finalCpu.system / 1000;
  const cpuPercent = ((totalCpuTimeMs / globalDuration) * 100).toFixed(1);

  benchmarkResults.resources = {
    durationWallMs: globalDuration,
    cpu: {
      userMs: userCpuTimeMs,
      systemMs: sysCpuTimeMs,
      totalMs: totalCpuTimeMs,
      utilizationPercent: parseFloat(cpuPercent),
    },
    memory: {
      rssInitialMB: initialMemory.rss / (1024 * 1024),
      rssFinalMB: finalMemory.rss / (1024 * 1024),
      heapUsedInitialMB: initialMemory.heapUsed / (1024 * 1024),
      heapUsedFinalMB: finalMemory.heapUsed / (1024 * 1024),
      heapDeltaMB: (finalMemory.heapUsed - initialMemory.heapUsed) / (1024 * 1024),
    },
  };

  // Guardar resultados JSON
  writeFileSync("benchmark-results.json", JSON.stringify(benchmarkResults, null, 2), "utf8");

  // Mostrar tabla consolidada
  console.log("┌────────────────────────────────────┬──────────┬──────────┬──────────┬──────────┬──────────────┐");
  console.log("│ Operación / Endpoint               │ Muestras │ Avg (ms) │ P95 (ms) │ Max (ms) │ Throughput   │");
  console.log("├────────────────────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────────┤");

  const row = (name, count, avg, p95, max, ops) => {
    const colName = name.padEnd(34);
    const colCount = String(count).padStart(8);
    const colAvg = avg.toFixed(3).padStart(8);
    const colP95 = p95.toFixed(3).padStart(8);
    const colMax = max.toFixed(3).padStart(8);
    const colOps = `${ops} ops/s`.padStart(12);
    return `│ ${colName} │ ${colCount} │ ${colAvg} │ ${colP95} │ ${colMax} │ ${colOps} │`;
  };

  console.log(row("ProductStore.create()", CREATE_COUNT, createStats.avg, createStats.p95, createStats.max, createThroughput));
  console.log(row("ProductStore.getById/Sku()", READ_COUNT, readStats.avg, readStats.p95, readStats.max, readThroughput));
  console.log(row("ProductStore.list() (Filtros+Locale)", QUERY_COUNT, queryStats.avg, queryStats.p95, queryStats.max, queryThroughput));
  console.log(row("ProductStore.adjustStock()", ADJUST_COUNT, adjustStats.avg, adjustStats.p95, adjustStats.max, adjustThroughput));
  console.log(row("HTTP GET /health (Express Pipeline)", HTTP_COUNT, httpStats.avg, httpStats.p95, httpStats.max, httpThroughput));
  console.log("└────────────────────────────────────┴──────────┴──────────┴──────────┴──────────┴──────────────┘\n");

  console.log("=== CONSUMO DE RECURSOS DEL SERVICIO ===");
  console.log(`⏱️  Tiempo Total de Prueba : ${(globalDuration / 1000).toFixed(2)} s`);
  console.log(`💻  Uso de CPU            : ${totalCpuTimeMs.toFixed(2)} ms (${cpuPercent}% del núcleo) [User: ${userCpuTimeMs.toFixed(2)} ms | Sys: ${sysCpuTimeMs.toFixed(2)} ms]`);
  console.log(`🧠  Memoria Heap Inicial  : ${formatBytes(initialMemory.heapUsed)}`);
  console.log(`🧠  Memoria Heap Final    : ${formatBytes(finalMemory.heapUsed)} (Delta: +${benchmarkResults.resources.memory.heapDeltaMB.toFixed(2)} MB)`);
  console.log(`📦  Memoria RSS Final     : ${formatBytes(finalMemory.rss)}`);
  console.log("\n✅ Resultados guardados en benchmark-results.json");
}

runBenchmark().catch((err) => {
  console.error("Error en benchmark:", err);
  process.exit(1);
});

