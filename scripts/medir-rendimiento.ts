import { performance } from "node:perf_hooks";
import os from "node:os";
import process from "node:process";
import { parsePagination } from "../src/services/pagination.service.js";
import { ProductStore } from "../src/services/product-store.js";

const ITERACIONES = Number(process.env.ITERACIONES ?? 10_000);
const ITERACIONES_LIST = Number(process.env.ITERACIONES_LIST ?? 500);

type MetricaServicio = {
  servicio: string;
  operacion: string;
  iter: number;
  totalMs: string;
  promUs: string;
  minUs: string;
  p95Us: string;
  maxUs: string;
  opsSeg: string;
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
  const aUs = (ms: number) => (ms * 1000).toFixed(2);

  resultados.push({
    servicio,
    operacion,
    iter: iteraciones,
    totalMs: totalMs.toFixed(2),
    promUs: aUs(totalMs / iteraciones),
    minUs: aUs(ordenados[0]!),
    p95Us: aUs(ordenados[Math.floor(iteraciones * 0.95)]!),
    maxUs: aUs(ordenados[iteraciones - 1]!),
    opsSeg: String(Math.round(iteraciones / (totalMs / 1000))),
  });
}

function imprimirTablaPorServicio(titulo: string, filas: MetricaServicio[]): void {
  const cols = [
    { key: "operacion", label: "Operacion", align: "left" as const },
    { key: "iter", label: "Iter", align: "right" as const },
    { key: "totalMs", label: "Total(ms)", align: "right" as const },
    { key: "promUs", label: "Prom(µs)", align: "right" as const },
    { key: "minUs", label: "Min(µs)", align: "right" as const },
    { key: "p95Us", label: "P95(µs)", align: "right" as const },
    { key: "maxUs", label: "Max(µs)", align: "right" as const },
    { key: "opsSeg", label: "Ops/seg", align: "right" as const },
  ] as const;

  const widths = cols.map((c) =>
    Math.max(
      c.label.length,
      ...filas.map((f) => String(f[c.key]).length),
    ),
  );

  const sep = (left: string, mid: string, right: string) =>
    left + widths.map((w) => "─".repeat(w + 2)).join(mid) + right;

  const formatRow = (vals: string[], aligns: readonly ("left" | "right")[]) =>
    "│" +
    vals
      .map((v, i) => {
        const w = widths[i]!;
        return " " + (aligns[i] === "right" ? v.padStart(w) : v.padEnd(w)) + " ";
      })
      .join("│") +
    "│";

  console.log(`\n▶ Servicio: ${titulo}`);
  console.log(sep("┌", "┬", "┐"));
  console.log(
    formatRow(
      cols.map((c) => c.label),
      cols.map(() => "left"),
    ),
  );
  console.log(sep("├", "┼", "┤"));
  for (const fila of filas) {
    console.log(
      formatRow(
        cols.map((c) => String(fila[c.key])),
        cols.map((c) => c.align),
      ),
    );
  }
  console.log(sep("└", "┴", "┘"));
}

console.log("====================================================================");
console.log("  TALLER DE TRAZABILIDAD - MEDICIÓN DE RENDIMIENTO DE SERVICIOS");
console.log(`  Entorno: Node ${process.version} | ${os.platform()} ${os.release()} (${os.arch()})`);
console.log("====================================================================\n");

// 1. Servicio: pagination.service
medir("pagination.service", "parsePagination (defecto)", ITERACIONES, () => {
  parsePagination();
});

medir("pagination.service", "parsePagination (válido)", ITERACIONES, (i) => {
  parsePagination({ page: String((i % 20) + 1), limit: "25" });
});

medir("pagination.service", "parsePagination (max limit)", ITERACIONES, () => {
  parsePagination({ page: "2", limit: "500" });
});

medir("pagination.service", "parsePagination (inválido)", ITERACIONES, () => {
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

medir("product-store", "list (sin filtro 1000)", ITERACIONES_LIST, () => {
  storeList.list();
});

medir("product-store", "list (con filtro 1000)", ITERACIONES_LIST, () => {
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
imprimirTablaPorServicio(
  "src/services/pagination.service.ts",
  resultados.filter((r) => r.servicio === "pagination.service"),
);
imprimirTablaPorServicio(
  "src/services/product-store.ts",
  resultados.filter((r) => r.servicio === "product-store"),
);
