// Lee el último .cpuprofile de debug/perfiles y muestra en qué funciones se fue el tiempo de CPU.
// Correr después de `npm run medir:perfil`:  npm run medir:resumen
import { readdirSync, readFileSync } from "node:fs";

const dir = "debug/perfiles";
const archivo = readdirSync(dir).filter((f) => f.endsWith(".cpuprofile")).sort().at(-1);
if (!archivo) throw new Error("No hay perfiles, corre primero npm run medir:perfil");

const { nodes, samples, timeDeltas } = JSON.parse(readFileSync(`${dir}/${archivo}`, "utf8"));
const porId = new Map(nodes.map((n) => [n.id, n.callFrame]));
const tiempo = new Map();
samples.forEach((id, i) => {
  const { functionName, url } = porId.get(id);
  const clave = `${functionName || "(función anónima)"}  ${url.split("/").at(-1) || ""}`;
  tiempo.set(clave, (tiempo.get(clave) ?? 0) + timeDeltas[i]);
});

const total = [...tiempo.values()].reduce((a, b) => a + b, 0);
console.log(`\nPerfil: ${archivo}\n`);
console.table(
  [...tiempo]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([funcion, us]) => ({ funcion, "ms CPU": +(us / 1000).toFixed(1), "%": +((us / total) * 100).toFixed(1) })),
);
