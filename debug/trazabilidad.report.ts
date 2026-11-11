/// <reference types="node" />
/**
 * globalSetup de Vitest: al terminar los tests lee debug/trazabilidad-results.json
 * (escrito por trazabilidad.setup.ts) e imprime la traza por test y el resumen por función.
 */

import { existsSync, readFileSync } from "node:fs";

type Llamada = { metodo: string; nivel: number; microsegundos: number; resultado: string };
const ARCHIVO = "debug/trazabilidad-results.json";

export default function setup() {
  return function teardown() {
    if (!existsSync(ARCHIVO)) return;
    const { porTest } = JSON.parse(readFileSync(ARCHIVO, "utf8")) as { porTest: Record<string, Llamada[]> };
    const fmt = (us: number) => `${us.toFixed(1)} µs`;
    const porMetodo = new Map<string, number[]>();

    console.log("\n================ TRAZABILIDAD POR TEST ================");
    for (const [test, llamadas] of Object.entries(porTest)) {
      const directas = llamadas.filter((l) => l.nivel === 0);
      const total = directas.reduce((acc, l) => acc + l.microsegundos, 0);
      console.log(`\n▶ ${test}  (tiempo en el servicio: ${fmt(total)}, ${directas.length} llamadas)`);
      for (const l of llamadas) {
        const sangria = "   " + "  ".repeat(l.nivel) + (l.nivel > 0 ? "└ " : "• ");
        const estado = l.resultado === "ok" ? "✔" : `✖ ${l.resultado}`;
        console.log(`${sangria}${l.metodo.padEnd(12)} ${fmt(l.microsegundos).padStart(11)}  ${estado}`);
        if (l.nivel === 0) porMetodo.set(l.metodo, [...(porMetodo.get(l.metodo) ?? []), l.microsegundos]);
      }
    }

    console.log("\n================ RESUMEN POR FUNCIÓN ================");
    console.table(
      [...porMetodo].map(([metodo, t]) => {
        const total = t.reduce((a, b) => a + b, 0);
        return {
          metodo,
          llamadas: t.length,
          "total (µs)": Number(total.toFixed(1)),
          "prom (µs)": Number((total / t.length).toFixed(1)),
          "min (µs)": Number(Math.min(...t).toFixed(1)),
          "max (µs)": Number(Math.max(...t).toFixed(1)),
        };
      }),
    );
    console.log(`Detalle guardado en ${ARCHIVO}\n`);
  };
}
