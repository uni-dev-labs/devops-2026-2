// Trazabilidad: mide cuánto tarda cada servicio en ejecutarse.
// Correr:        npm run medir            (N=10000 npm run medir para cambiar el tamaño)
// Perfil de CPU: npm run medir:perfil     (deja un .cpuprofile en debug/perfiles para abrir en Chrome DevTools)
// Resumen:       npm run medir:resumen    (funciones que más CPU consumieron en el último perfil)

import { performance } from "node:perf_hooks";
import { ProductStore } from "../src/services/product-store.js";
import { parsePagination } from "../src/services/pagination.service.js";

const N = Number(process.env.N ?? 5000);
const filas: Record<string, string | number>[] = [];

// Corre fn n veces, toma el tiempo de cada llamada y guarda total, promedio, mínimo, p95 y máximo.
function medir(servicio: string, metodo: string, fn: (i: number) => unknown, n = N) {
  const tiempos: number[] = [];
  const inicioTotal = performance.now();
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    fn(i);
    tiempos.push(performance.now() - t0);
  }
  const total = performance.now() - inicioTotal;
  tiempos.sort((a, b) => a - b);
  const us = (ms: number) => +(ms * 1000).toFixed(2);

  filas.push({
    servicio,
    metodo,
    llamadas: n,
    "total ms": +total.toFixed(2),
    "prom µs": us(total / n),
    "min µs": us(tiempos[0]),
    "p95 µs": us(tiempos[Math.floor(n * 0.95)]),
    "max µs": us(tiempos[n - 1]),
  });
}

const store = new ProductStore();
const ids: string[] = [];
const categorias = ["Granos", "Bebidas", "Despensa", "Lacteos"];

medir("product-store", "create", (i) => {
  ids.push(
    store.create({
      name: `Producto ${i}`,
      sku: `SKU-${i}`,
      price: (i % 100) * 10,
      stock: 10,
      category: categorias[i % categorias.length],
    }).id,
  );
});
medir("product-store", "getById", (i) => store.getById(ids[i]));
medir("product-store", "getBySku", (i) => store.getBySku(`sku-${i}`));
// list recorre y ordena todo el almacén (N productos), por eso se mide con menos llamadas.
medir("product-store", "list (filtros)", () => store.list({ search: "producto 1", category: "bebidas", minPrice: 100, maxPrice: 800 }), 200);
medir("product-store", "list (todo)", () => store.list(), 200);
medir("product-store", "update", (i) => store.update(ids[i], { price: (i % 50) + 1 }));
medir("product-store", "adjustStock", (i) => store.adjustStock(ids[i], 1));
medir("product-store", "remove", (i) => store.remove(ids[i]));

medir("pagination.service", "parsePagination (ok)", (i) => parsePagination({ page: String((i % 20) + 1), limit: "25" }));
medir("pagination.service", "parsePagination (inválido)", () => parsePagination({ page: "-2", limit: "abc" }));

console.log(`\nTiempo de ejecución por servicio (${N} productos en el almacén, Node ${process.version})\n`);
console.table(filas);

const lento = filas.reduce((a, b) => ((a["prom µs"] as number) > (b["prom µs"] as number) ? a : b));
console.log(`\nEl más lento en promedio: ${lento.servicio}.${lento.metodo} con ${lento["prom µs"]} µs por llamada.\n`);
