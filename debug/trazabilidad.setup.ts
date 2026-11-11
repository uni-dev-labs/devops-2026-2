/// <reference types="node" />
/**
 * Trazabilidad por test: mide cuánto tarda CADA llamada a ProductStore
 * dentro de cada test (no el test completo).
 *
 * No modifica los tests ni el servicio: envuelve los métodos de
 * ProductStore.prototype antes de que corran los tests (setupFiles de Vitest).
 *
 * Ejecutar:  npm run perf:tests
 * Resultado: consola (debug/trazabilidad.report.ts) + debug/trazabilidad-results.json
 */

import { writeFileSync } from "node:fs";
import { afterAll, beforeEach, expect } from "vitest";
import { ProductStore, ProductError } from "../src/services/product-store.js";

type Llamada = {
  metodo: string;
  nivel: number; // 0 = llamada directa del test, 1+ = llamada interna (p. ej. getBySku → getById)
  microsegundos: number;
  resultado: "ok" | string; // "ok" o el código de ProductError
};

const METODOS = ["create", "getById", "getBySku", "list", "update", "remove", "adjustStock"] as const;
const trazas = new Map<string, Llamada[]>();
let testActual = "(fuera de un test)";
let nivel = 0;

// Los tests usan vi.useFakeTimers(), que congela Date, performance y process.hrtime.
// Guardamos la función REAL del reloj al cargar este archivo, antes de que se falsee.
const relojReal = process.hrtime.bigint;
const ahora = () => relojReal();

for (const metodo of METODOS) {
  const original = ProductStore.prototype[metodo] as (...args: unknown[]) => unknown;

  (ProductStore.prototype as unknown as Record<string, unknown>)[metodo] = function (
    this: ProductStore,
    ...args: unknown[]
  ) {
    const miNivel = nivel++;
    const inicio = ahora();
    let resultado = "ok";
    try {
      return original.apply(this, args);
    } catch (error) {
      resultado = error instanceof ProductError ? error.code : "ERROR";
      throw error;
    } finally {
      const microsegundos = Number(ahora() - inicio) / 1000;
      nivel--;
      const lista = trazas.get(testActual) ?? [];
      lista.push({ metodo, nivel: miNivel, microsegundos, resultado });
      trazas.set(testActual, lista);
    }
  };
}

beforeEach(() => {
  testActual = expect.getState().currentTestName ?? "(sin nombre)";
});

afterAll(() => {
  // Vitest no muestra la consola de este hook: se guarda en JSON y
  // debug/trazabilidad.report.ts lo imprime al terminar todos los tests.
  writeFileSync(
    "debug/trazabilidad-results.json",
    JSON.stringify({ generado: new Date().toISOString(), porTest: Object.fromEntries(trazas) }, null, 2),
  );
});
