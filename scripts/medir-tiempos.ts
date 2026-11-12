/**
 * Trazabilidad: tiempo de ejecución de los servicios.
 *
 * Mide cada método de ProductStore (con 100, 1.000 y 10.000 productos) y el
 * servicio parsePagination. Calcula promedio, mediana, p95, mínimo, máximo y
 * ops/s, y deja el reporte en docs/trazabilidad/ (Markdown y CSV).
 *
 * Uso:
 *   npm run trazabilidad           -> 1000 iteraciones por servicio
 *   npm run trazabilidad -- 5000   -> iteraciones personalizadas
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import { ProductStore, ProductError } from "../src/services/product-store.js";
import { parsePagination } from "../src/services/pagination.service.js";

const ITERACIONES = Number(process.argv[2]) > 0 ? Math.floor(Number(process.argv[2])) : 1000;
const TAMANOS = [100, 1_000, 10_000];
const CALENTAMIENTO = 50;
const CATEGORIAS = ["Bebidas", "Snacks", "Aseo", "Lácteos", null];

type Resultado = {
  escenario: string;
  servicio: string;
  iteraciones: number;
  promedio: number;
  mediana: number;
  p95: number;
  min: number;
  max: number;
  opsPorSeg: number;
  total: number;
};

function percentil(ordenados: number[], p: number): number {
  const idx = Math.ceil((p / 100) * ordenados.length) - 1;
  return ordenados[Math.min(ordenados.length - 1, Math.max(0, idx))];
}

/** Ejecuta fn n veces y devuelve las estadísticas en milisegundos. */
function medir(escenario: string, servicio: string, n: number, fn: (i: number) => unknown): Resultado {
  for (let i = 0; i < CALENTAMIENTO; i++) {
    try {
      fn(i);
    } catch (e) {
      if (!(e instanceof ProductError)) throw e;
    }
  }

  const tiempos: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    try {
      fn(i);
    } catch (e) {
      if (!(e instanceof ProductError)) throw e; // errores de negocio también se miden
    }
    tiempos[i] = performance.now() - t0;
  }

  const ordenados = [...tiempos].sort((a, b) => a - b);
  const total = tiempos.reduce((a, b) => a + b, 0);
  return {
    escenario,
    servicio,
    iteraciones: n,
    promedio: total / n,
    mediana: percentil(ordenados, 50),
    p95: percentil(ordenados, 95),
    min: ordenados[0],
    max: ordenados[ordenados.length - 1],
    opsPorSeg: total > 0 ? n / (total / 1000) : Number.POSITIVE_INFINITY,
    total,
  };
}

function poblar(store: ProductStore, cantidad: number, prefijo: string): string[] {
  const ids: string[] = [];
  for (let i = 0; i < cantidad; i++) {
    const p = store.create({
      name: `Producto ${prefijo} ${i}`,
      sku: `${prefijo}-${i}`,
      price: (i % 500) + 1,
      stock: 100,
      category: CATEGORIAS[i % CATEGORIAS.length],
    });
    ids.push(p.id);
  }
  return ids;
}

function medirProductStore(tamano: number): Resultado[] {
  const escenario = `ProductStore (${tamano.toLocaleString("es-CO")} productos)`;
  // Las operaciones costosas (list) se iteran menos en almacenes grandes.
  const nList = tamano >= 10_000 ? Math.min(ITERACIONES, 50) : Math.min(ITERACIONES, 200);
  const resultados: Resultado[] = [];

  // create: cada iteración crea un producto nuevo sobre un almacén ya poblado
  {
    const store = new ProductStore();
    poblar(store, tamano, "BASE");
    let n = 0;
    resultados.push(
      medir(escenario, "create", ITERACIONES, () =>
        store.create({ name: `Nuevo ${n}`, sku: `NEW-${n++}`, price: 10, stock: 5, category: "Snacks" }),
      ),
    );
  }

  const store = new ProductStore();
  const ids = poblar(store, tamano, "SKU");

  resultados.push(medir(escenario, "getById", ITERACIONES, (i) => store.getById(ids[i % ids.length])));
  resultados.push(medir(escenario, "getBySku", ITERACIONES, (i) => store.getBySku(`SKU-${i % tamano}`)));
  resultados.push(medir(escenario, "list (sin filtros)", nList, () => store.list()));
  resultados.push(
    medir(escenario, "list (search + category + precio)", nList, () =>
      store.list({ search: "producto", category: "Snacks", minPrice: 50, maxPrice: 300 }),
    ),
  );
  resultados.push(
    medir(escenario, "update", ITERACIONES, (i) => store.update(ids[i % ids.length], { price: (i % 900) + 1 })),
  );
  resultados.push(
    medir(escenario, "adjustStock", ITERACIONES, (i) => store.adjustStock(ids[i % ids.length], i % 2 === 0 ? 1 : -1)),
  );

  // remove: se borran productos creados solo para esta medición
  {
    const total = ITERACIONES + CALENTAMIENTO;
    const borrables = poblar(store, total, "DEL");
    let k = 0;
    resultados.push(medir(escenario, "remove", ITERACIONES, () => store.remove(borrables[k++])));
  }

  return resultados;
}

function medirPaginacion(): Resultado[] {
  const escenario = "pagination.service";
  return [
    medir(escenario, "parsePagination (válido)", ITERACIONES, (i) =>
      parsePagination({ page: String((i % 20) + 1), limit: "10" }),
    ),
    medir(escenario, "parsePagination (inválido -> defecto)", ITERACIONES, () =>
      parsePagination({ page: "abc", limit: "-5" }),
    ),
  ];
}

// ---------- Ejecución ----------
const inicio = performance.now();
const resultados: Resultado[] = [];
for (const tamano of TAMANOS) resultados.push(...medirProductStore(tamano));
resultados.push(...medirPaginacion());
const duracionTotal = (performance.now() - inicio) / 1000;

// ---------- Reporte ----------
const fmt = (n: number, d = 4) => n.toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtOps = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString("es-CO") : "∞");

const fecha = new Date();
const cpu = cpus()[0]?.model ?? "desconocida";
const encabezado = [
  "# Trazabilidad: tiempo de ejecución de los servicios",
  "",
  `- Fecha: ${fecha.toISOString()}`,
  `- Node.js: ${process.version}`,
  `- Sistema: ${platform()} ${release()}`,
  `- CPU: ${cpu} (${cpus().length} hilos)`,
  `- RAM: ${(totalmem() / 1024 ** 3).toFixed(1)} GB`,
  `- Iteraciones por servicio: ${ITERACIONES} (list: hasta 200; con 10.000 productos: 50)`,
  `- Duración total de la medición: ${duracionTotal.toFixed(2)} s`,
  "",
  "Tiempos en milisegundos por llamada, medidos con `performance.now()`.",
  `Cada servicio se ejecuta ${CALENTAMIENTO} veces antes de medir (calentamiento del JIT).`,
  "Se genera con `npm run trazabilidad`.",
];

const md: string[] = [...encabezado];
for (const escenario of [...new Set(resultados.map((r) => r.escenario))]) {
  md.push("", `## ${escenario}`, "");
  md.push("| Servicio | Iteraciones | Promedio | Mediana | p95 | Mín | Máx | ops/s |");
  md.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const r of resultados.filter((x) => x.escenario === escenario)) {
    md.push(
      `| ${r.servicio} | ${r.iteraciones} | ${fmt(r.promedio)} | ${fmt(r.mediana)} | ${fmt(r.p95)} | ${fmt(r.min)} | ${fmt(r.max)} | ${fmtOps(r.opsPorSeg)} |`,
    );
  }
}

const masLento = [...resultados].sort((a, b) => b.promedio - a.promedio)[0];
const totalOps = resultados.reduce((a, r) => a + r.iteraciones, 0);
const totalMs = resultados.reduce((a, r) => a + r.total, 0);
md.push(
  "",
  "## Resumen general",
  "",
  `- Llamadas medidas: ${totalOps.toLocaleString("es-CO")}`,
  `- Tiempo medido acumulado: ${fmt(totalMs, 2)} ms`,
  `- Promedio general por llamada: ${fmt(totalMs / totalOps)} ms`,
  `- Servicio más lento: \`${masLento.servicio}\` en ${masLento.escenario} (${fmt(masLento.promedio)} ms en promedio)`,
  "",
);

const csv = [
  "escenario,servicio,iteraciones,promedio_ms,mediana_ms,p95_ms,min_ms,max_ms,ops_s",
  ...resultados.map((r) =>
    [
      `"${r.escenario}"`,
      `"${r.servicio}"`,
      r.iteraciones,
      r.promedio.toFixed(6),
      r.mediana.toFixed(6),
      r.p95.toFixed(6),
      r.min.toFixed(6),
      r.max.toFixed(6),
      Number.isFinite(r.opsPorSeg) ? Math.round(r.opsPorSeg) : "",
    ].join(","),
  ),
].join("\n");

mkdirSync("docs/trazabilidad", { recursive: true });
writeFileSync("docs/trazabilidad/tiempos-servicios.md", md.join("\n"), "utf8");
writeFileSync("docs/trazabilidad/tiempos-servicios.csv", csv + "\n", "utf8");

console.table(
  resultados.map((r) => ({
    escenario: r.escenario,
    servicio: r.servicio,
    "promedio (ms)": Number(r.promedio.toFixed(4)),
    "p95 (ms)": Number(r.p95.toFixed(4)),
    "ops/s": Number.isFinite(r.opsPorSeg) ? Math.round(r.opsPorSeg) : "∞",
  })),
);
console.log(`\nReporte: docs/trazabilidad/tiempos-servicios.md y .csv (${duracionTotal.toFixed(2)} s)`);
