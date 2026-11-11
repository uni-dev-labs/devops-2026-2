/**
 * Trazabilidad: lee el perfil de CPU más reciente (generado con `node --cpu-prof`)
 * y muestra en qué funciones se fue el tiempo de CPU (tiempo propio de cada función).
 *
 *   npm run perf:perfil
 *
 * El archivo .cpuprofile también se puede abrir en Chrome DevTools → Performance.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { CARPETA_RESULTADOS, guardarJson, publicarMarkdown, tablaMarkdown } from "./estadisticas.js";

type CallFrame = { functionName: string; url: string; lineNumber: number };
type Nodo = { id: number; callFrame: CallFrame };
type Perfil = { nodes: Nodo[]; samples: number[]; timeDeltas: number[] };

const carpeta = path.join(CARPETA_RESULTADOS, "perfiles");
const archivo = readdirSync(carpeta)
  .filter((nombre) => nombre.endsWith(".cpuprofile"))
  .map((nombre) => path.join(carpeta, nombre))
  .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs)
  .at(-1);

if (!archivo) {
  throw new Error(`No hay perfiles en ${carpeta}. Corre primero: npm run perf:perfil`);
}

const perfil = JSON.parse(readFileSync(archivo, "utf8")) as Perfil;
const marcos = new Map(perfil.nodes.map((nodo) => [nodo.id, nodo.callFrame]));

const fuentes = new Map<string, string[]>();

/**
 * tsx compila cada archivo .ts a una sola línea, así que el perfil reporta la línea 1.
 * Para los archivos del repo se busca la definición de la función en el código fuente.
 */
function lineaEnFuente(ruta: string, funcion: string, lineaPerfil: number): number {
  if (lineaPerfil > 0 || !funcion || funcion.startsWith("(")) return lineaPerfil + 1;
  let lineas = fuentes.get(ruta);
  if (!lineas) {
    try {
      lineas = readFileSync(ruta, "utf8").split("\n");
    } catch {
      return lineaPerfil + 1;
    }
    fuentes.set(ruta, lineas);
  }
  const nombre = funcion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const definicion = new RegExp(`(function\\s+${nombre}\\b|class\\s+${nombre}\\b|^\\s*(async\\s+)?${nombre}\\s*\\()`);
  const indice = lineas.findIndex((linea) => definicion.test(linea));
  return indice >= 0 ? indice + 1 : lineaPerfil + 1;
}

function ubicacion(marco: CallFrame): string {
  if (!marco.url) return "nativo / V8";
  const limpio = marco.url.replace(/^file:\/\//, "");
  const relativo = path.relative(process.cwd(), limpio);
  if (relativo.startsWith("..") || relativo.startsWith("node_modules") || marco.url.startsWith("node:")) {
    const corto = marco.url.startsWith("node:") ? marco.url : limpio.split("/").slice(-2).join("/");
    return `${corto}:${marco.lineNumber + 1}`;
  }
  return `${relativo}:${lineaEnFuente(limpio, marco.functionName, marco.lineNumber)}`;
}

function origen(marco: CallFrame): string {
  if (marco.url.includes("/src/")) return "código del proyecto";
  if (marco.url.includes("/perf/")) return "arnés de medición";
  if (marco.url.startsWith("node:")) return "Node.js";
  if (marco.url.includes("node_modules")) return "dependencias";
  if (marco.functionName.startsWith("(")) return "motor V8";
  return "nativo";
}

const tiempoPorFuncion = new Map<string, { funcion: string; ubicacion: string; origen: string; microsegundos: number }>();
perfil.samples.forEach((idNodo, i) => {
  const marco = marcos.get(idNodo);
  if (!marco) return;
  const funcion = marco.functionName || "(anónima)";
  const clave = `${funcion}@${marco.url}:${marco.lineNumber}`;
  const actual = tiempoPorFuncion.get(clave) ?? { funcion, ubicacion: ubicacion(marco), origen: origen(marco), microsegundos: 0 };
  actual.microsegundos += perfil.timeDeltas[i] ?? 0;
  tiempoPorFuncion.set(clave, actual);
});

const total = [...tiempoPorFuncion.values()].reduce((acc, f) => acc + f.microsegundos, 0);
const ocupadas = [...tiempoPorFuncion.values()].filter((f) => f.funcion !== "(idle)");
const top = ocupadas.sort((a, b) => b.microsegundos - a.microsegundos).slice(0, 12);

const porOrigen = new Map<string, number>();
for (const f of tiempoPorFuncion.values()) porOrigen.set(f.origen, (porOrigen.get(f.origen) ?? 0) + f.microsegundos);

const porcentaje = (us: number) => `${((us / total) * 100).toFixed(1)} %`;
const ms = (us: number) => `${(us / 1000).toFixed(1)} ms`;

console.log(`\nPerfil: ${path.relative(process.cwd(), archivo)} (${ms(total)} muestreados)\n`);
console.table(top.map((f) => ({ funcion: f.funcion, ubicacion: f.ubicacion, "CPU propio": ms(f.microsegundos), "%": porcentaje(f.microsegundos) })));

const delProyecto = top.find((f) => f.origen === "código del proyecto");
const markdown = [
  "## Perfil de CPU de los servicios (`node --cpu-prof`)",
  "",
  `Funciones con más tiempo de CPU propio durante la medición (${ms(total)} muestreados). El \`.cpuprofile\` completo está en los artefactos de la corrida y se abre en Chrome DevTools.`,
  "",
  tablaMarkdown(
    ["#", "Función", "Ubicación", "Origen", "CPU propio", "%"],
    top.map((f, i) => [i + 1, `\`${f.funcion}\``, `\`${f.ubicacion}\``, f.origen, ms(f.microsegundos), porcentaje(f.microsegundos)]),
  ),
  "",
  `Por origen: ${[...porOrigen].sort((a, b) => b[1] - a[1]).map(([nombre, us]) => `${nombre} ${porcentaje(us)}`).join(" · ")}.`,
  "",
  delProyecto
    ? `La función del proyecto con más CPU propio es \`${delProyecto.funcion}\` (\`${delProyecto.ubicacion}\`), con ${porcentaje(delProyecto.microsegundos)} del tiempo muestreado.`
    : "",
  "",
].join("\n");

publicarMarkdown("perfil-cpu.md", markdown);
guardarJson("perfil-cpu.json", { archivo: path.relative(process.cwd(), archivo), totalMicrosegundos: total, top, porOrigen: Object.fromEntries(porOrigen) });
