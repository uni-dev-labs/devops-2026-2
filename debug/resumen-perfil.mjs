// Lee los .cpuprofile de debug/perfiles y muestra en qué funciones se fue el tiempo de CPU.
// Correr después de `npm run medir:perfil`:  npm run medir:resumen
import { readdirSync, readFileSync } from "node:fs";

const dir = "debug/perfiles";
const archivos = readdirSync(dir).filter((f) => f.endsWith(".cpuprofile"));
if (archivos.length === 0) throw new Error("No hay perfiles, corre primero npm run medir:perfil");

// Agrupa el tiempo de CPU por función, sin contar el tiempo en reposo (idle).
function tiempoPorFuncion(archivo) {
  const { nodes, samples, timeDeltas } = JSON.parse(readFileSync(`${dir}/${archivo}`, "utf8"));
  const porId = new Map(nodes.map((n) => [n.id, n.callFrame]));
  const tiempo = new Map();
  samples.forEach((id, i) => {
    const { functionName, url } = porId.get(id);
    if (functionName === "(idle)") return;
    const clave = `${functionName || "(función anónima)"}  ${url.split("/").at(-1) || ""}`;
    tiempo.set(clave, (tiempo.get(clave) ?? 0) + timeDeltas[i]);
  });
  return tiempo;
}

// Con tsx, Node escribe un perfil por hilo (el del cargador de módulos casi no trabaja);
// se toma el perfil con más tiempo de CPU, que es el del hilo que corrió los servicios.
const sumar = (mapa) => [...mapa.values()].reduce((a, b) => a + b, 0);
const [archivo, tiempo] = archivos
  .map((f) => [f, tiempoPorFuncion(f)])
  .reduce((a, b) => (sumar(a[1]) >= sumar(b[1]) ? a : b));

const total = sumar(tiempo);
console.log(`\nPerfil: ${archivo} (${(total / 1000).toFixed(1)} ms de CPU)\n`);
console.table(
  [...tiempo]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([funcion, us]) => ({ funcion, "ms CPU": +(us / 1000).toFixed(1), "%": +((us / total) * 100).toFixed(1) })),
);
