/**
 * Trazabilidad: rendimiento de cada servicio del stack (api, postgres, mongo) medido
 * a través de sus endpoints HTTP, con la API ya desplegada (docker compose o `npm run dev`).
 *
 *   docker compose up --build -d
 *   npm run perf:endpoints
 *
 * Variables opcionales:
 *   API_URL             URL base de la API (por defecto http://localhost:3000)
 *   PERF_REQUESTS       peticiones medidas por endpoint (por defecto 300)
 *   PERF_CONCURRENCIA   peticiones simultáneas (por defecto 10)
 *   PERF_ESPERA_S       segundos máximos esperando a que la API y las bases respondan (por defecto 120)
 *
 * Resultados: perf/resultados/endpoints.json y perf/resultados/endpoints.md.
 * Termina con código 1 si algún endpoint responde con un estado inesperado.
 */
import { performance } from "node:perf_hooks";
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

const API_URL = (process.env.API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PETICIONES = enteroPositivo(process.env.PERF_REQUESTS, 300);
const CONCURRENCIA = enteroPositivo(process.env.PERF_CONCURRENCIA, 10);
const CALENTAMIENTO = 20;
const ESPERA_MAXIMA_S = enteroPositivo(process.env.PERF_ESPERA_S, 120);
const TIMEOUT_MS = 10_000;
const CORRIDA = Date.now().toString(36);

type Servicio = "api" | "postgres" | "mongo";

type Endpoint = {
  servicio: Servicio;
  metodo: "GET" | "POST";
  ruta: string;
  estadoEsperado: number;
  cuerpo?: (i: number) => unknown;
};

type ResultadoEndpoint = Endpoint & {
  estadisticas: Estadisticas;
  errores: number;
  estados: Record<string, number>;
  bytesPromedio: number;
};

// Orden pensado: primero se crean datos (POST) y luego se leen (GET), así las lecturas no van vacías.
const ENDPOINTS: Endpoint[] = [
  { servicio: "api", metodo: "GET", ruta: "/health", estadoEsperado: 200 },
  { servicio: "postgres", metodo: "GET", ruta: "/api/postgres/health", estadoEsperado: 200 },
  {
    servicio: "postgres",
    metodo: "POST",
    ruta: "/api/postgres/users",
    estadoEsperado: 201,
    cuerpo: (i) => ({ name: `Perf ${i}`, email: `perf-${CORRIDA}-${i}@example.com` }),
  },
  { servicio: "postgres", metodo: "GET", ruta: "/api/postgres/users?page=1&limit=10", estadoEsperado: 200 },
  { servicio: "mongo", metodo: "GET", ruta: "/api/mongo/health", estadoEsperado: 200 },
  {
    servicio: "mongo",
    metodo: "POST",
    ruta: "/api/mongo/users",
    estadoEsperado: 201,
    cuerpo: (i) => ({ name: `Perf ${i}`, email: `perf-${CORRIDA}-${i}@example.com` }),
  },
  { servicio: "mongo", metodo: "GET", ruta: "/api/mongo/users?page=1&limit=10", estadoEsperado: 200 },
  {
    servicio: "mongo",
    metodo: "POST",
    ruta: "/api/products",
    estadoEsperado: 201,
    cuerpo: (i) => ({ name: `Producto perf ${i}`, price: (i % 100) + 1 }),
  },
  { servicio: "mongo", metodo: "GET", ruta: "/api/products", estadoEsperado: 200 },
];

const DESCRIPCION_SERVICIO: Record<Servicio, string> = {
  api: "Express sin base de datos",
  postgres: "Express + PostgreSQL",
  mongo: "Express + MongoDB",
};

function enteroPositivo(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : porDefecto;
}

const pausa = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

async function peticion(endpoint: Endpoint, i: number): Promise<{ ms: number; estado: number; bytes: number }> {
  const inicio = performance.now();
  try {
    const respuesta = await fetch(`${API_URL}${endpoint.ruta}`, {
      method: endpoint.metodo,
      headers: endpoint.cuerpo ? { "content-type": "application/json" } : undefined,
      body: endpoint.cuerpo ? JSON.stringify(endpoint.cuerpo(i)) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const cuerpo = await respuesta.arrayBuffer();
    return { ms: performance.now() - inicio, estado: respuesta.status, bytes: cuerpo.byteLength };
  } catch {
    return { ms: performance.now() - inicio, estado: 0, bytes: 0 }; // 0 = error de red o timeout
  }
}

/** Espera a que la API y las dos bases respondan antes de medir. */
async function esperarStack(): Promise<void> {
  const salud = ["/health", "/api/postgres/health", "/api/mongo/health"];
  const limite = Date.now() + ESPERA_MAXIMA_S * 1000;
  let pendientes = salud;
  while (Date.now() < limite) {
    const estados = await Promise.all(
      salud.map(async (ruta) => {
        try {
          const r = await fetch(`${API_URL}${ruta}`, { signal: AbortSignal.timeout(3_000) });
          await r.arrayBuffer();
          return r.status === 200;
        } catch {
          return false;
        }
      }),
    );
    pendientes = salud.filter((_, i) => !estados[i]);
    if (pendientes.length === 0) {
      console.log(`Stack listo en ${API_URL}`);
      return;
    }
    await pausa(2_000);
  }
  throw new Error(`El stack no respondió en ${ESPERA_MAXIMA_S} s. Sin respuesta: ${pendientes.join(", ")}`);
}

async function medirEndpoint(endpoint: Endpoint, desplazamiento: number): Promise<ResultadoEndpoint> {
  for (let i = 0; i < CALENTAMIENTO; i++) await peticion(endpoint, desplazamiento + i);

  const duraciones: number[] = [];
  const estados: Record<string, number> = {};
  let bytes = 0;
  let siguiente = 0;

  const inicio = performance.now();
  const trabajador = async () => {
    while (siguiente < PETICIONES) {
      const i = siguiente++;
      const r = await peticion(endpoint, desplazamiento + CALENTAMIENTO + i);
      duraciones.push(r.ms);
      estados[r.estado] = (estados[r.estado] ?? 0) + 1;
      bytes += r.bytes;
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador));
  const total = performance.now() - inicio;

  const errores = PETICIONES - (estados[endpoint.estadoEsperado] ?? 0);
  return { ...endpoint, estadisticas: resumir(duraciones, total), errores, estados, bytesPromedio: bytes / PETICIONES };
}

/** Cuántos documentos devuelve una lectura (campo `count` de la respuesta). */
async function documentosDevueltos(ruta: string): Promise<number | null> {
  try {
    const r = await fetch(`${API_URL}${ruta}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const cuerpo = (await r.json()) as { count?: unknown };
    return typeof cuerpo.count === "number" ? cuerpo.count : null;
  } catch {
    return null;
  }
}

function kb(bytes: number): string {
  return bytes < 1024 ? `${Math.round(bytes)} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

async function main(): Promise<void> {
  await esperarStack();

  const resultados: ResultadoEndpoint[] = [];
  for (const [indice, endpoint] of ENDPOINTS.entries()) {
    process.stdout.write(`Midiendo ${endpoint.metodo} ${endpoint.ruta} ... `);
    const resultado = await medirEndpoint(endpoint, indice * 100_000);
    resultados.push(resultado);
    console.log(
      `p95 ${duracion(resultado.estadisticas.p95Ms)}, ${entero(resultado.estadisticas.opsPorSegundo)} req/s, ${resultado.errores} errores`,
    );
  }

  // Agregado por servicio del stack: todas las latencias de sus endpoints juntas.
  const porServicio = (Object.keys(DESCRIPCION_SERVICIO) as Servicio[]).map((servicio) => {
    const propios = resultados.filter((r) => r.servicio === servicio);
    const peticiones = propios.reduce((acc, r) => acc + r.estadisticas.muestras, 0);
    const tiempo = propios.reduce((acc, r) => acc + r.estadisticas.totalMs, 0);
    const promedioPonderado =
      propios.reduce((acc, r) => acc + r.estadisticas.promedioMs * r.estadisticas.muestras, 0) / peticiones;
    const peor = propios.reduce((a, b) => (b.estadisticas.p95Ms > a.estadisticas.p95Ms ? b : a));
    return {
      servicio,
      endpoints: propios.length,
      peticiones,
      errores: propios.reduce((acc, r) => acc + r.errores, 0),
      reqPorSegundo: (peticiones / tiempo) * 1000,
      promedioMs: promedioPonderado,
      peorP95Ms: peor.estadisticas.p95Ms,
      peorEndpoint: `${peor.metodo} ${peor.ruta}`,
    };
  });

  const ctx = contexto();
  const totalErrores = resultados.reduce((acc, r) => acc + r.errores, 0);
  const masLento = resultados.reduce((a, b) => (b.estadisticas.p95Ms > a.estadisticas.p95Ms ? b : a));
  const base = resultados.find((r) => r.ruta === "/health");
  const productos = await documentosDevueltos("/api/products");
  const usuariosPg = await documentosDevueltos("/api/postgres/users?page=1&limit=10");

  const hallazgos: string[] = [
    totalErrores === 0
      ? `Las ${entero(PETICIONES * resultados.length)} peticiones medidas respondieron con el estado esperado (0 errores).`
      : `**${totalErrores} peticiones respondieron con un estado inesperado.** Revisa la columna Estados.`,
    `El endpoint más lento es **${masLento.metodo} ${masLento.ruta}** (servicio ${masLento.servicio}): p95 de ${duracion(masLento.estadisticas.p95Ms)}` +
      (base ? `, ${(masLento.estadisticas.p95Ms / base.estadisticas.p95Ms).toFixed(1)}× el p95 de \`GET /health\`, que no toca ninguna base.` : "."),
  ];
  if (productos !== null) {
    const getProductos = resultados.find((r) => r.metodo === "GET" && r.ruta === "/api/products");
    hallazgos.push(
      `\`GET /api/products\` no pagina: cada respuesta trae los ${entero(productos)} productos guardados` +
        (getProductos ? ` (${kb(getProductos.bytesPromedio)} en promedio)` : "") +
        `, así que su latencia crece con la colección. Las listas de usuarios paginan` +
        (usuariosPg !== null ? ` (${usuariosPg} por página).` : "."),
    );
  }

  console.log("");
  console.table(
    porServicio.map((s) => ({
      servicio: s.servicio,
      endpoints: s.endpoints,
      peticiones: s.peticiones,
      errores: s.errores,
      "req/s": entero(s.reqPorSegundo),
      promedio: duracion(s.promedioMs),
      "peor p95": `${duracion(s.peorP95Ms)} (${s.peorEndpoint})`,
    })),
  );
  for (const linea of hallazgos) console.log(`- ${linea.replaceAll("**", "")}`);

  const markdown = [
    "## Rendimiento de los servicios del stack desplegado (api · postgres · mongo)",
    "",
    `API en \`${API_URL}\` · commit \`${ctx.commit}\` · ${entero(PETICIONES)} peticiones por endpoint con ${CONCURRENCIA} en paralelo (más ${CALENTAMIENTO} de calentamiento).`,
    "",
    "### Por servicio",
    "",
    tablaMarkdown(
      ["Servicio", "Qué mide", "Endpoints", "Peticiones", "Errores", "req/s", "Latencia promedio", "Peor p95"],
      porServicio.map((s) => [
        `**${s.servicio}**`,
        DESCRIPCION_SERVICIO[s.servicio],
        s.endpoints,
        entero(s.peticiones),
        s.errores,
        entero(s.reqPorSegundo),
        duracion(s.promedioMs),
        `${duracion(s.peorP95Ms)} (\`${s.peorEndpoint}\`)`,
      ]),
    ),
    "",
    "### Por endpoint",
    "",
    tablaMarkdown(
      ["Servicio", "Endpoint", "Estados", "req/s", "Promedio", "p50", "p95", "p99", "Máx", "Respuesta"],
      resultados.map((r) => [
        r.servicio,
        `\`${r.metodo} ${r.ruta}\``,
        Object.entries(r.estados)
          .map(([estado, cantidad]) => `${estado === "0" ? "sin respuesta" : estado}×${cantidad}`)
          .join(", "),
        entero(r.estadisticas.opsPorSegundo),
        duracion(r.estadisticas.promedioMs),
        duracion(r.estadisticas.p50Ms),
        duracion(r.estadisticas.p95Ms),
        duracion(r.estadisticas.p99Ms),
        duracion(r.estadisticas.maxMs),
        kb(r.bytesPromedio),
      ]),
    ),
    "",
    "**Hallazgos**",
    "",
    ...hallazgos.map((linea) => `- ${linea}`),
    "",
  ].join("\n");

  publicarMarkdown("endpoints.md", markdown);
  guardarJson("endpoints.json", {
    contexto: ctx,
    apiUrl: API_URL,
    peticionesPorEndpoint: PETICIONES,
    concurrencia: CONCURRENCIA,
    porServicio,
    resultados,
  });

  if (totalErrores > 0) {
    console.error(`\n${totalErrores} peticiones con estado inesperado.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
