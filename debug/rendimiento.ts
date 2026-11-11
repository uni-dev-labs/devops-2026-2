/// <reference types="node" />
/**
 * Taller de Trazabilidad: medición de rendimiento del servicio de productos.
 *
 * Mide cada método de ProductStore (src/services/product-store.ts) con dos técnicas:
 *  - console.time / console.timeEnd → tiempo total de cada bloque.
 *  - performance.now()             → promedio, mínimo, máximo y p95 por llamada.
 *
 * Ejecutar:  npm run perf
 * Perfil CPU: npm run perf:profile   (genera un .cpuprofile en debug/profiles)
 */

import { performance } from "node:perf_hooks";
import { ProductStore, ProductError } from "../src/services/product-store.js";

const ITERACIONES = Number(process.env.ITERACIONES ?? 10_000);
const resultados: Record<string, string | number>[] = [];

function medir(
  servicio: string,
  operacion: string,
  iteraciones: number,
  fn: (i: number) => void,
  calentar = true, // false en operaciones que no se pueden repetir (create, remove)
) {
  // Calentamiento para que el JIT optimice antes de medir.
  if (calentar) for (let i = 0; i < Math.min(100, iteraciones); i++) fn(i);

  const etiqueta = `${servicio}.${operacion} x${iteraciones}`;
  const tiempos = new Float64Array(iteraciones);

  console.time(etiqueta);
  for (let i = 0; i < iteraciones; i++) {
    const inicio = performance.now();
    fn(i);
    tiempos[i] = performance.now() - inicio;
  }
  console.timeEnd(etiqueta);

  const ordenados = Array.from(tiempos).sort((a, b) => a - b);
  const total = ordenados.reduce((acc, t) => acc + t, 0);
  const us = (ms: number) => Number((ms * 1000).toFixed(2));

  resultados.push({
    servicio,
    operacion,
    iteraciones,
    "total (ms)": Number(total.toFixed(2)),
    "prom (µs)": us(total / iteraciones),
    "min (µs)": us(ordenados[0]),
    "p95 (µs)": us(ordenados[Math.floor(iteraciones * 0.95)]),
    "max (µs)": us(ordenados[iteraciones - 1]),
    "ops/seg": Math.round(iteraciones / (total / 1000)),
  });
}

console.log(`\n=== Medición de rendimiento del servicio de productos (${ITERACIONES} iteraciones) ===\n`);

const store = new ProductStore();
const ids: string[] = [];
const categorias = ["tecnologia", "hogar", "ropa", "deportes"];

medir("product-store", "create", ITERACIONES, (i) => {
  const p = store.create({
    name: `Producto ${i}`,
    sku: `SKU-${i}`,
    price: (i % 500) + 1,
    stock: i % 50,
    category: categorias[i % categorias.length],
  });
  ids.push(p.id);
}, false);

medir("product-store", "getById", ITERACIONES, (i) => {
  store.getById(ids[i % ids.length]);
});

medir("product-store", "getBySku", ITERACIONES, (i) => {
  store.getBySku(`sku-${i % ids.length}`);
});

medir("product-store", "update", ITERACIONES, (i) => {
  store.update(ids[i % ids.length], { price: (i % 300) + 10, name: `Producto editado ${i}` });
});

medir("product-store", "adjustStock", ITERACIONES, (i) => {
  store.adjustStock(ids[i % ids.length], 1);
});

medir("product-store", "create(sku duplicado)", ITERACIONES, () => {
  try {
    store.create({ name: "Duplicado", sku: "SKU-1", price: 10 });
  } catch (error) {
    if (!(error instanceof ProductError)) throw error;
  }
});

// list recorre, filtra, ordena y copia todo el catálogo: es la operación más costosa.
const ITER_LIST = Math.max(1, Math.floor(ITERACIONES / 500));
medir("product-store", `list(sin filtros, ${ids.length} prod)`, ITER_LIST, () => {
  store.list();
});
medir("product-store", "list(filtros)", ITER_LIST, () => {
  store.list({ search: "editado", category: "hogar", minPrice: 50, maxPrice: 200, active: true });
});

medir("product-store", "remove", ITERACIONES, (i) => {
  store.remove(ids[i]);
}, false);

console.log("\n=== Resumen ===");
console.table(resultados);

const memoria = process.memoryUsage();
console.log(
  `Memoria → heapUsed: ${(memoria.heapUsed / 1024 / 1024).toFixed(2)} MB | rss: ${(memoria.rss / 1024 / 1024).toFixed(2)} MB`,
);
console.log(`Node ${process.version} | ${process.platform} ${process.arch}\n`);
