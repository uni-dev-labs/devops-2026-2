/**
 * Trazabilidad de rendimiento del ProductStore.
 * Ejecuta cada servicio N veces, mide su duración con performance.now()
 * y calcula estadísticas por servicio y un cálculo general.
 *
 * Uso: npm run trazabilidad            (1000 iteraciones)
 *      npm run trazabilidad -- 5000    (iteraciones personalizadas)
 */
import { performance } from "node:perf_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
import { ProductStore, ProductError } from "../src/services/product-store.js";

const ITERACIONES = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 1000;

type Resultado = {
  servicio: string;
  iteraciones: number;
  totalMs: number;
  promedioMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  opsPorSeg: number;
};

const r = (n: number, d = 4) => Number(n.toFixed(d));

function percentil(ordenados: number[], p: number): number {
  const idx = Math.min(ordenados.length - 1, Math.max(0, Math.ceil((p / 100) * ordenados.length) - 1));
  return ordenados[idx];
}

function medir(servicio: string, fn: (i: number) => unknown): Resultado {
  // Calentamiento para que el JIT no distorsione las primeras mediciones
  for (let i = 0; i < 20; i++) {
    try { fn(-1 - i); } catch { /* ignorar */ }
  }

  const tiempos: number[] = [];
  for (let i = 0; i < ITERACIONES; i++) {
    const t0 = performance.now();
    try {
      fn(i);
    } catch (e) {
      if (!(e instanceof ProductError)) throw e; // errores de negocio esperados también cuentan
    }
    tiempos.push(performance.now() - t0);
  }

  const ordenados = [...tiempos].sort((a, b) => a - b);
  const total = tiempos.reduce((a, b) => a + b, 0);
  return {
    servicio,
    iteraciones: ITERACIONES,
    totalMs: r(total),
    promedioMs: r(total / ITERACIONES),
    minMs: r(ordenados[0]),
    maxMs: r(ordenados.at(-1)!),
    p50Ms: r(percentil(ordenados, 50)),
    p95Ms: r(percentil(ordenados, 95)),
    opsPorSeg: Math.round(ITERACIONES / (total / 1000)),
  };
}

// ---------- Escenario ----------
const store = new ProductStore();
const categorias = ["Bebidas", "Snacks", "Aseo", "Lácteos", null];
const ids: string[] = [];

const resultados: Resultado[] = [];

resultados.push(
  medir("create", (i) => {
    const p = store.create({
      name: `Producto ${i}`,
      sku: `SKU-${i < 0 ? `W${-i}` : i}`,
      price: (Math.abs(i) % 100) + 1,
      stock: 50,
      category: categorias[Math.abs(i) % categorias.length],
    });
    if (i >= 0) ids.push(p.id);
  }),
);

resultados.push(medir("getById", (i) => store.getById(ids[Math.abs(i) % ids.length])));
resultados.push(medir("getBySku", (i) => store.getBySku(`sku-${Math.abs(i) % ITERACIONES}`)));
resultados.push(medir("list (sin filtros)", () => store.list()));
resultados.push(
  medir("list (con filtros)", () =>
    store.list({ search: "producto 1", category: "bebidas", active: true, minPrice: 10, maxPrice: 80 }),
  ),
);
resultados.push(
  medir("update", (i) => store.update(ids[Math.abs(i) % ids.length], { price: (Math.abs(i) % 50) + 5 })),
);
resultados.push(
  medir("adjustStock", (i) => store.adjustStock(ids[Math.abs(i) % ids.length], i % 2 === 0 ? 1 : -1)),
);
resultados.push(medir("remove", (i) => store.remove(ids[Math.abs(i) % ids.length])));

// ---------- Cálculo general ----------
const totalGeneral = resultados.reduce((a, s) => a + s.totalMs, 0);
const operaciones = resultados.reduce((a, s) => a + s.iteraciones, 0);
const porPromedio = [...resultados].sort((a, b) => b.promedioMs - a.promedioMs);

const general = {
  servicios: resultados.length,
  operaciones,
  totalMs: r(totalGeneral),
  promedioGeneralMs: r(totalGeneral / operaciones),
  opsPorSeg: Math.round(operaciones / (totalGeneral / 1000)),
  masLento: porPromedio[0].servicio,
  masRapido: porPromedio.at(-1)!.servicio,
};

// ---------- Salida ----------
console.log(`\nTrazabilidad ProductStore — ${ITERACIONES} iteraciones por servicio\n`);
console.table(
  resultados.map((s) => ({
    ...s,
    "% del total": `${((s.totalMs / totalGeneral) * 100).toFixed(1)}%`,
  })),
);
console.log("Cálculo general:");
console.table([general]);

const fecha = new Date();
const sello = fecha.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const dir = "reports/trazabilidad";
mkdirSync(dir, { recursive: true });

const csv = [
  "servicio,iteraciones,totalMs,promedioMs,minMs,maxMs,p50Ms,p95Ms,opsPorSeg",
  ...resultados.map((s) =>
    [s.servicio, s.iteraciones, s.totalMs, s.promedioMs, s.minMs, s.maxMs, s.p50Ms, s.p95Ms, s.opsPorSeg].join(","),
  ),
  `GENERAL,${general.operaciones},${general.totalMs},${general.promedioGeneralMs},,,,,${general.opsPorSeg}`,
].join("\n");
writeFileSync(`${dir}/rendimiento-${sello}.csv`, csv + "\n");

const md = `# Trazabilidad de rendimiento — ProductStore

- Fecha: ${fecha.toISOString()}
- Node: ${process.version}
- Iteraciones por servicio: ${ITERACIONES}

## Tiempo por servicio

| Servicio | Promedio (ms) | Mín (ms) | Máx (ms) | p50 (ms) | p95 (ms) | Total (ms) | Ops/s | % del total |
|---|---|---|---|---|---|---|---|---|
${resultados
  .map(
    (s) =>
      `| ${s.servicio} | ${s.promedioMs} | ${s.minMs} | ${s.maxMs} | ${s.p50Ms} | ${s.p95Ms} | ${s.totalMs} | ${s.opsPorSeg} | ${((s.totalMs / totalGeneral) * 100).toFixed(1)}% |`,
  )
  .join("\n")}

## Cálculo general

| Métrica | Valor |
|---|---|
| Servicios medidos | ${general.servicios} |
| Operaciones totales | ${general.operaciones} |
| Tiempo total (ms) | ${general.totalMs} |
| Promedio general por operación (ms) | ${general.promedioGeneralMs} |
| Throughput general (ops/s) | ${general.opsPorSeg} |
| Servicio más lento (promedio) | ${general.masLento} |
| Servicio más rápido (promedio) | ${general.masRapido} |
`;
writeFileSync(`${dir}/rendimiento-${sello}.md`, md);
console.log(`\nReportes guardados en ${dir}/rendimiento-${sello}.{csv,md}`);
