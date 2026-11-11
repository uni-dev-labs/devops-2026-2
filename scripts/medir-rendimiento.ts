import { performance } from "node:perf_hooks";
import os from "node:os";
import process from "node:process";
import { parsePagination } from "../src/services/pagination.service.js";
import { ProductStore } from "../src/services/product-store.js";

const ITERACIONES = Number(process.env.ITERACIONES ?? 10_000);
const ITERACIONES_LIST = Number(process.env.ITERACIONES_LIST ?? 1_000);

type MetricaServicio = {
  Servicio: string;
  Operacion: string;
  Iteraciones: number;
  "Total (ms)": number;
  "Promedio (µs)": number;
  "Min (µs)": number;
  "P95 (µs)": number;
  "Max (µs)": number;
  "Ops/seg": number;
};

const resultados: MetricaServicio[] = [];

function medir(
  servicio: string,
  operacion: string,
  iteraciones: number,
  fn: (i: number) => void,
  calentar = true,
): void {
  if (calentar) {
    const warmup = Math.min(200, iteraciones);
    for (let i = 0; i < warmup; i += 1) {
      fn(i);
    }
  }

  const etiqueta = `[${servicio}] ${operacion} (x${iteraciones})`;
  const tiempos = new Float64Array(iteraciones);

  console.time(etiqueta);
  for (let i = 0; i < iteraciones; i += 1) {
    const inicio = performance.now();
    fn(i);
    tiempos[i] = performance.now() - inicio;
  }
  console.timeEnd(etiqueta);

  const ordenados = Array.from(tiempos).sort((a, b) => a - b);
  const totalMs = ordenados.reduce((acc, t) => acc + t, 0);
  const aMicrosegundos = (ms: number) => Number((ms * 1000).toFixed(2));

  resultados.push({
    Servicio: servicio,
    Operacion: operacion,
    Iteraciones: iteraciones,
    "Total (ms)": Number(totalMs.toFixed(2)),
    "Promedio (µs)": aMicrosegundos(totalMs / iteraciones),
    "Min (µs)": aMicrosegundos(ordenados[0]!),
    "P95 (µs)": aMicrosegundos(ordenados[Math.floor(iteraciones * 0.95)]!),
    "Max (µs)": aMicrosegundos(ordenados[iteraciones - 1]!),
    "Ops/seg": Math.round(iteraciones / (totalMs / 1000)),
  });
}

console.log("====================================================================");
console.log("  TALLER DE TRAZABILIDAD - MEDICIÓN DE RENDIMIENTO DE SERVICIOS");
console.log(`  Entorno: Node ${process.version} | ${os.platform()} ${os.release()} (${os.arch()})`);
console.log("====================================================================\n");

// 1. Servicio: pagination.service
medir("pagination.service", "parsePagination (por defecto)", ITERACIONES, () => {
  parsePagination();
});

medir("pagination.service", "parsePagination (query válido)", ITERACIONES, (i) => {
  parsePagination({ page: String((i % 20) + 1), limit: "25" });
});

medir("pagination.service", "parsePagination (limit > MAX_LIMIT)", ITERACIONES, () => {
  parsePagination({ page: "2", limit: "500" });
});

medir("pagination.service", "parsePagination (valores inválidos)", ITERACIONES, () => {
  parsePagination({ page: "abc", limit: "-5" });
});

// 2. Servicio: product-store
const store = new ProductStore();
const ids: string[] = [];
const categorias = ["Granos", "Bebidas", "Despensa", "Lacteos"];

medir(
  "product-store",
  "create",
  ITERACIONES,
  (i) => {
    const p = store.create({
      name: `Producto ${i}`,
      sku: `PRD-${i}`,
      price: (i % 500) * 100 + 100,
      stock: (i % 50) + 10,
      category: categorias[i % categorias.length],
    });
    ids.push(p.id);
  },
  false,
);

medir("product-store", "getById", ITERACIONES, (i) => {
  store.getById(ids[i % ids.length]!);
});

medir("product-store", "getBySku", ITERACIONES, (i) => {
  store.getBySku(`prd-${i % ids.length}`);
});

medir("product-store", "update (precio y nombre)", ITERACIONES, (i) => {
  store.update(ids[i % ids.length]!, {
    price: (i % 300) * 100 + 50,
    name: `Producto Actualizado ${i}`,
  });
});

medir("product-store", "adjustStock (+1 / -1)", ITERACIONES, (i) => {
  const delta = i % 2 === 0 ? 1 : -1;
  store.adjustStock(ids[i % ids.length]!, delta);
});

// Para list usamos un almacén con 1,000 productos para un volumen estándar de consulta
const storeList = new ProductStore();
for (let i = 0; i < 1000; i += 1) {
  storeList.create({
    name: `Producto ${i}`,
    sku: `LST-${i}`,
    price: (i % 500) * 100,
    stock: i % 50,
    category: categorias[i % categorias.length],
  });
}

medir("product-store", "list (sin filtros - 1000 items)", ITERACIONES_LIST, () => {
  storeList.list();
});

medir("product-store", "list (con filtros - 1000 items)", ITERACIONES_LIST, () => {
  storeList.list({
    search: "producto 1",
    category: "bebidas",
    active: true,
    minPrice: 1000,
    maxPrice: 30000,
  });
});

medir(
  "product-store",
  "remove",
  ITERACIONES,
  (i) => {
    store.remove(ids[i]!);
  },
  false,
);

console.log("\n=== RESUMEN DE RENDIMIENTO POR SERVICIO ===");
console.table(resultados);

