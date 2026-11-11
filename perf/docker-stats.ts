/**
 * Trazabilidad: consumo de CPU y memoria de cada contenedor del stack (api, postgres, mongo),
 * en reposo y durante la prueba de carga de `perf:endpoints`.
 *
 * Lee las muestras de `docker stats --no-stream --format '{{json .}}'` que guarda el workflow en:
 *   perf/resultados/docker-stats-reposo.ndjson
 *   perf/resultados/docker-stats-carga.ndjson
 *
 *   npm run perf:docker-stats
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { CARPETA_RESULTADOS, entero, guardarJson, publicarMarkdown, tablaMarkdown } from "./estadisticas.js";

type Muestra = { Name: string; CPUPerc: string; MemUsage: string; PIDs?: string };
type Fase = "reposo" | "carga";
type Resumen = { muestras: number; cpuPromedio: number; cpuMaximo: number; memPromedioMiB: number; memMaximoMiB: number; pidsMaximo: number };

const SERVICIO_POR_CONTENEDOR: Record<string, string> = {
  "devops-api": "api",
  "devops-postgres": "postgres",
  "devops-mongo": "mongo",
};

const UNIDADES: Record<string, number> = {
  B: 1 / 1024 ** 2,
  KB: 1000 / 1024 ** 2,
  KIB: 1 / 1024,
  MB: 1000 ** 2 / 1024 ** 2,
  MIB: 1,
  GB: 1000 ** 3 / 1024 ** 2,
  GIB: 1024,
};

/** "33.6MiB / 7.75GiB" → 33.6 (MiB usados). */
function memoriaMiB(texto: string): number {
  const usado = texto.split("/")[0]?.trim() ?? "";
  const coincide = /^([\d.]+)\s*([a-z]+)$/i.exec(usado);
  if (!coincide) return Number.NaN;
  return Number(coincide[1]) * (UNIDADES[coincide[2]!.toUpperCase()] ?? Number.NaN);
}

function leer(fase: Fase): Muestra[] {
  const ruta = path.join(CARPETA_RESULTADOS, `docker-stats-${fase}.ndjson`);
  if (!existsSync(ruta)) return [];
  const muestras: Muestra[] = [];
  for (const linea of readFileSync(ruta, "utf8").split("\n")) {
    if (!linea.trim().startsWith("{")) continue;
    try {
      muestras.push(JSON.parse(linea) as Muestra);
    } catch {
      // la última línea puede quedar cortada al detener el muestreo; se descarta
    }
  }
  return muestras;
}

function resumir(muestras: Muestra[]): Resumen | null {
  if (muestras.length === 0) return null;
  const cpu = muestras.map((m) => Number.parseFloat(m.CPUPerc));
  const mem = muestras.map((m) => memoriaMiB(m.MemUsage));
  const pids = muestras.map((m) => Number(m.PIDs ?? Number.NaN)).filter(Number.isFinite);
  const promedio = (valores: number[]) => valores.reduce((a, b) => a + b, 0) / valores.length;
  return {
    muestras: muestras.length,
    cpuPromedio: promedio(cpu),
    cpuMaximo: Math.max(...cpu),
    memPromedioMiB: promedio(mem),
    memMaximoMiB: Math.max(...mem),
    pidsMaximo: pids.length ? Math.max(...pids) : Number.NaN,
  };
}

const fases: Record<Fase, Muestra[]> = { reposo: leer("reposo"), carga: leer("carga") };
if (fases.carga.length === 0) {
  throw new Error(`No hay muestras de carga en ${CARPETA_RESULTADOS}/docker-stats-carga.ndjson`);
}

const contenedores = [...new Set([...fases.reposo, ...fases.carga].map((m) => m.Name))].sort();
const filas = contenedores.map((nombre) => ({
  contenedor: nombre,
  servicio: SERVICIO_POR_CONTENEDOR[nombre] ?? nombre,
  reposo: resumir(fases.reposo.filter((m) => m.Name === nombre)),
  carga: resumir(fases.carga.filter((m) => m.Name === nombre)),
}));

const pct = (valor: number | undefined) => (valor === undefined || !Number.isFinite(valor) ? "—" : `${valor.toFixed(1)} %`);
const mib = (valor: number | undefined) => (valor === undefined || !Number.isFinite(valor) ? "—" : `${valor.toFixed(1)} MiB`);

console.table(
  filas.map((f) => ({
    servicio: f.servicio,
    "CPU reposo": pct(f.reposo?.cpuPromedio),
    "CPU carga prom": pct(f.carga?.cpuPromedio),
    "CPU carga máx": pct(f.carga?.cpuMaximo),
    "Mem reposo": mib(f.reposo?.memPromedioMiB),
    "Mem carga máx": mib(f.carga?.memMaximoMiB),
    muestras: f.carga?.muestras ?? 0,
  })),
);

const masCpu = filas.reduce((a, b) => ((b.carga?.cpuPromedio ?? 0) > (a.carga?.cpuPromedio ?? 0) ? b : a));
const masMem = filas.reduce((a, b) => ((b.carga?.memMaximoMiB ?? 0) > (a.carga?.memMaximoMiB ?? 0) ? b : a));

const markdown = [
  "### CPU y memoria por contenedor (`docker stats`)",
  "",
  `Muestras tomadas en reposo (antes de la carga) y durante la prueba de carga. 100 % = un núcleo completo.`,
  "",
  tablaMarkdown(
    ["Servicio", "Contenedor", "CPU en reposo", "CPU en carga (prom)", "CPU en carga (máx)", "Memoria en reposo", "Memoria en carga (máx)", "Procesos máx", "Muestras"],
    filas.map((f) => [
      `**${f.servicio}**`,
      `\`${f.contenedor}\``,
      pct(f.reposo?.cpuPromedio),
      pct(f.carga?.cpuPromedio),
      pct(f.carga?.cpuMaximo),
      mib(f.reposo?.memPromedioMiB),
      mib(f.carga?.memMaximoMiB),
      entero(f.carga?.pidsMaximo ?? Number.NaN),
      `${f.reposo?.muestras ?? 0} + ${f.carga?.muestras ?? 0}`,
    ]),
  ),
  "",
  masCpu.contenedor === masMem.contenedor
    ? `Durante la carga, **${masCpu.servicio}** es el contenedor que más CPU usa (${pct(masCpu.carga?.cpuPromedio)} en promedio, pico de ${pct(masCpu.carga?.cpuMaximo)}) ` +
      `y también el que más memoria ocupa (${mib(masMem.carga?.memMaximoMiB)}).`
    : `Durante la carga, **${masCpu.servicio}** es el contenedor que más CPU usa (${pct(masCpu.carga?.cpuPromedio)} en promedio, pico de ${pct(masCpu.carga?.cpuMaximo)}) ` +
      `y **${masMem.servicio}** el que más memoria ocupa (${mib(masMem.carga?.memMaximoMiB)}).`,
  "",
].join("\n");

publicarMarkdown("docker-stats.md", markdown);
guardarJson("docker-stats.json", filas);
