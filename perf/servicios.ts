/**
 * Trazabilidad: rendimiento de cada servicio de código de `src/services`.
 *
 * Mide cada operación de ProductStore y de pagination.service llamada por llamada
 * y reporta promedio, p50, p95, p99, máximo y operaciones por segundo.
 * También mide cómo escala `list()` con el tamaño del almacén y cuánta memoria usa cada producto.
 *
 *   npm run perf:servicios                 # N = 5000 llamadas por operación
 *   PERF_N=20000 npm run perf:servicios    # más llamadas
 *   npm run perf:perfil                    # perfil de CPU (.cpuprofile) y funciones que más CPU usan
 *
 * Resultados: perf/resultados/servicios.json y perf/resultados/servicios.md
 * En GitHub Actions la tabla se publica en el resumen del job.
 */
import { performance } from "node:perf_hooks";
import { ProductStore, type CreateProductInput } from "../src/services/product-store.js";
import { parsePagination } from "../src/services/pagination.service.js";
import {
  contexto,
  duracion,
  entero,
  guardarJson,
  publicarMarkdown,
  resumir,
  tablaMarkdown,
  type Estadisticas,
} from "./estadisticas.js";

const MODO_PERFIL = process.env.PERF_PERFIL === "1";
const N = enteroPositivo(process.env.PERF_N, MODO_PERFIL ? 2000 : 5000);
const TAMANOS_LISTA = [100, 1_000, 5_000];

type Resultado = { servicio: string; operacion: string; escenario: string } & Estadisticas;

function enteroPositivo(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : porDefecto;
}

/** Cuántas veces llamar a list(): es la operación más costosa, así que se llama menos. */
function llamadasLista(tamano: number): number {
  if (tamano <= 100) return 200;
  if (tamano <= 1_000) return 50;
  return 10;
}

function producto(i: number): CreateProductInput {
  return {
    name: `Producto ${i}`,
    sku: `SKU-${i}`,
    price: (i % 100) + 0.5,
    stock: 10,
    category: i % 2 === 0 ? "Hogar" : "Ropa",
  };
}

function almacenCon(cantidad: number): ProductStore {
  const store = new ProductStore();
  for (let i = 0; i < cantidad; i++) store.create(producto(i));
  return store;
}

/** Ejecuta fn y devuelve el error en vez de propagarlo, para medir las rutas de error. */
function capturar(fn: () => unknown): unknown {
  try {
    return fn();
  } catch (error) {
    return error;
  }
}

let sumidero = 0; // evita que el motor descarte llamadas cuyo resultado no se usa

function medir(
  servicio: string,
  operacion: string,
  escenario: string,
  llamadas: number,
  fn: (i: number) => unknown,
): Resultado {
  const duraciones = new Array<number>(llamadas);
  const inicio = performance.now();
  for (let i = 0; i < llamadas; i++) {
    const t0 = performance.now();
    const resultado = fn(i);
    duraciones[i] = performance.now() - t0;
    if (resultado) sumidero++;
  }
  const total = performance.now() - inicio;
  return { servicio, operacion, escenario, ...resumir(duraciones, total) };
}

function suite(n: number, tamanosLista: number[]): Resultado[] {
  const resultados: Resultado[] = [];
  const store = new ProductStore();
  const ids: string[] = [];
  const errores = Math.min(n, 1_000);

  resultados.push(
    medir("ProductStore", "create", "producto válido", n, (i) => {
      const creado = store.create(producto(i));
      ids.push(creado.id);
      return creado;
    }),
    medir("ProductStore", "create", "sku duplicado → DUPLICATE_SKU", errores, (i) =>
      capturar(() => store.create(producto(i))),
    ),
    medir("ProductStore", "create", "datos inválidos → VALIDATION", errores, () =>
      capturar(() => store.create({ name: " ", sku: "x", price: -1 })),
    ),
    medir("ProductStore", "getById", "id existente", n, (i) => store.getById(ids[i]!)),
    medir("ProductStore", "getById", "id inexistente → null", n, () => store.getById("no-existe")),
    medir("ProductStore", "getBySku", "sku existente (normaliza)", n, (i) => store.getBySku(` sku-${i} `)),
    medir("ProductStore", "update", "cambia el precio", n, (i) => store.update(ids[i]!, { price: (i % 50) + 1 })),
    medir("ProductStore", "update", "cambia el sku", n, (i) => store.update(ids[i]!, { sku: `NEW-${i}` })),
    medir("ProductStore", "update", "parche vacío", n, (i) => store.update(ids[i]!, {})),
    medir("ProductStore", "adjustStock", "suma 1", n, (i) => store.adjustStock(ids[i]!, 1)),
    medir("ProductStore", "adjustStock", "deja stock negativo → INSUFFICIENT_STOCK", errores, (i) =>
      capturar(() => store.adjustStock(ids[i]!, -1_000_000)),
    ),
    medir(
      "ProductStore",
      "list",
      `search + category + precio (${entero(n)} productos)`,
      llamadasLista(n),
      () => store.list({ search: "producto 1", category: "ropa", minPrice: 10, maxPrice: 80 }),
    ),
    medir("ProductStore", "remove", "id existente", n, (i) => store.remove(ids[i]!)),
  );

  for (const tamano of tamanosLista) {
    const lleno = almacenCon(tamano);
    resultados.push(
      medir("ProductStore", "list", `sin filtros (${entero(tamano)} productos)`, llamadasLista(tamano), () =>
        lleno.list(),
      ),
    );
  }

  resultados.push(
    medir("pagination.service", "parsePagination", "?page=3&limit=20", n, () =>
      parsePagination({ page: "3", limit: "20" }),
    ),
    medir("pagination.service", "parsePagination", "sin parámetros", n, () => parsePagination()),
    medir("pagination.service", "parsePagination", "valores inválidos", n, () =>
      parsePagination({ page: "-1", limit: "abc" }),
    ),
  );

  return resultados;
}

/** Bytes de heap por producto guardado. Necesita `node --expose-gc`; sin él devuelve null. */
function memoriaPorProducto(cantidad: number): { productos: number; bytesPorProducto: number; totalMiB: number } | null {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (!gc) return null;
  gc();
  const antes = process.memoryUsage().heapUsed;
  const store = almacenCon(cantidad);
  gc();
  const despues = process.memoryUsage().heapUsed;
  if (store.getById("no-existe")) sumidero++; // mantiene vivo el almacén hasta aquí
  const bytes = Math.max(0, despues - antes);
  return { productos: cantidad, bytesPorProducto: bytes / cantidad, totalMiB: bytes / 1024 ** 2 };
}

function hallazgos(resultados: Resultado[]): string[] {
  const lineas: string[] = [];
  const masLenta = resultados.reduce((a, b) => (b.promedioMs > a.promedioMs ? b : a));
  lineas.push(
    `La operación más lenta es **${masLenta.servicio}.${masLenta.operacion}** (${masLenta.escenario}): ${duracion(masLenta.promedioMs)} en promedio por llamada.`,
  );

  const listas = TAMANOS_LISTA.map((tamano) =>
    resultados.find((r) => r.operacion === "list" && r.escenario === `sin filtros (${entero(tamano)} productos)`),
  );
  const primera = listas[0];
  const ultima = listas.at(-1);
  if (primera && ultima) {
    const factorDatos = TAMANOS_LISTA.at(-1)! / TAMANOS_LISTA[0]!;
    const factorTiempo = ultima.promedioMs / primera.promedioMs;
    lineas.push(
      `\`list()\` ordena todo el almacén en cada llamada: con ${factorDatos}× más productos ` +
        `(${entero(TAMANOS_LISTA[0]!)} → ${entero(TAMANOS_LISTA.at(-1)!)}) tarda ${factorTiempo.toFixed(1)}× más ` +
        `(${duracion(primera.promedioMs)} → ${duracion(ultima.promedioMs)}).`,
    );
  }

  const lecturas = resultados.filter((r) => r.operacion === "getById" || r.operacion === "getBySku");
  if (lecturas.length) {
    const peor = Math.max(...lecturas.map((r) => r.p95Ms));
    lineas.push(
      `Las lecturas por id y por sku van directo a un índice en memoria (\`Map\`) sin recorrer el almacén: p95 de ${duracion(peor)} o menos con ${entero(N)} productos guardados.`,
    );
  }

  const paginacion = resultados.filter((r) => r.servicio === "pagination.service");
  if (paginacion.length) {
    const ops = Math.min(...paginacion.map((r) => r.opsPorSegundo));
    lineas.push(`\`parsePagination\` no es un cuello de botella: más de ${entero(ops)} llamadas por segundo en todos los escenarios.`);
  }
  return lineas;
}

function main(): void {
  // Calentamiento: una pasada corta para que el JIT optimice antes de medir.
  suite(200, [TAMANOS_LISTA[0]!]);

  const resultados = suite(N, MODO_PERFIL ? [TAMANOS_LISTA[0]!, TAMANOS_LISTA[1]!] : TAMANOS_LISTA);
  if (MODO_PERFIL) {
    console.log(`Perfil de CPU generado con N = ${N} (${sumidero} resultados).`);
    return;
  }

  const memoria = memoriaPorProducto(N);
  const ctx = contexto();

  console.table(
    resultados.map((r) => ({
      servicio: r.servicio,
      operacion: r.operacion,
      escenario: r.escenario,
      llamadas: r.muestras,
      promedio: duracion(r.promedioMs),
      p50: duracion(r.p50Ms),
      p95: duracion(r.p95Ms),
      p99: duracion(r.p99Ms),
      max: duracion(r.maxMs),
      "ops/s": entero(r.opsPorSegundo),
    })),
  );

  const lineasHallazgos = hallazgos(resultados);
  if (memoria) {
    lineasHallazgos.push(
      `Memoria: ${entero(memoria.productos)} productos ocupan ${memoria.totalMiB.toFixed(2)} MiB de heap ` +
        `(~${entero(memoria.bytesPorProducto)} bytes por producto, incluidos los índices por id y por sku).`,
    );
  }
  for (const linea of lineasHallazgos) console.log(`- ${linea.replaceAll("**", "")}`);

  const markdown = [
    "## Rendimiento de los servicios de código (`src/services`)",
    "",
    `Commit \`${ctx.commit}\` · rama \`${ctx.rama}\` · Node ${ctx.node} · ${ctx.cpu} · ${entero(N)} llamadas por operación (list: según tamaño).`,
    "",
    tablaMarkdown(
      ["Servicio", "Operación", "Escenario", "Llamadas", "Promedio", "p50", "p95", "p99", "Máx", "ops/s"],
      resultados.map((r) => [
        r.servicio,
        `\`${r.operacion}\``,
        r.escenario,
        entero(r.muestras),
        duracion(r.promedioMs),
        duracion(r.p50Ms),
        duracion(r.p95Ms),
        duracion(r.p99Ms),
        duracion(r.maxMs),
        entero(r.opsPorSegundo),
      ]),
    ),
    "",
    "**Hallazgos**",
    "",
    ...lineasHallazgos.map((linea) => `- ${linea}`),
    "",
  ].join("\n");

  publicarMarkdown("servicios.md", markdown);
  const ruta = guardarJson("servicios.json", { contexto: ctx, llamadasPorOperacion: N, memoria, resultados });
  console.log(`\nResultados en ${ruta}`);
}

main();
