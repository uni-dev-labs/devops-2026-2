#!/usr/bin/env node
/**
 * Mide cuánto tardan los tests del proyecto.
 *
 * Ejecuta vitest con el reporter JSON, lee el resultado y muestra:
 *  - tiempo de pared total (desde que arranca vitest hasta que termina)
 *  - duración por archivo de test
 *  - los tests individuales más lentos
 *
 * Uso:
 *   npm run test:timing                 -> suite principal (vitest.config.ts)
 *   npm run test:timing -- productos    -> suite de la práctica de productos
 *   npm run test:timing -- principal --exclude "otra-carpeta/**"  -> argumentos extra para vitest
 */
import { spawnSync } from "node:child_process";
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import path from "node:path";

const [suiteArg, ...extraArgs] = process.argv.slice(2);
const suite = suiteArg === "productos" ? "productos" : "principal";
const outputFile = "timing-results.json";
const vitestArgs = ["vitest", "run", "--reporter=default", "--reporter=json", `--outputFile=${outputFile}`];
if (suite === "productos") vitestArgs.push("--config", "vitest.productos.config.ts");
// Cualquier argumento adicional se pasa tal cual a vitest, p. ej. --exclude "carpeta/**"
vitestArgs.push(...extraArgs);

const t0 = performance.now();
const run = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", vitestArgs, {
  stdio: "inherit",
  shell: process.platform === "win32",
});
const wallMs = performance.now() - t0;

if (!existsSync(outputFile)) {
  console.error(`No se generó ${outputFile}; vitest terminó con código ${run.status}`);
  process.exit(run.status ?? 1);
}

const report = JSON.parse(readFileSync(outputFile, "utf8"));
const files = report.testResults
  .map((f) => ({
    file: path.relative(process.cwd(), f.name).split(path.sep).join("/"),
    tests: f.assertionResults.length,
    status: f.status,
    ms: f.endTime - f.startTime,
  }))
  .sort((a, b) => b.ms - a.ms);

const tests = report.testResults
  .flatMap((f) => f.assertionResults.map((t) => ({ name: t.fullName, status: t.status, ms: t.duration ?? 0 })))
  .sort((a, b) => b.ms - a.ms);

const fmt = (ms) => `${ms.toFixed(0)} ms`;
const pad = (s, n) => String(s).padEnd(n);

console.log(`\n=== Tiempos de tests (suite: ${suite}) ===`);
console.log(`Resultado: ${report.success ? "OK" : "FALLÓ"} | ${report.numPassedTests}/${report.numTotalTests} tests pasaron`);
console.log(`Tiempo de pared (npx vitest run completo): ${(wallMs / 1000).toFixed(2)} s`);
console.log(`Tiempo sumado de los archivos de test:       ${(files.reduce((a, f) => a + f.ms, 0) / 1000).toFixed(2)} s\n`);

console.log(pad("Archivo", 58) + pad("Tests", 7) + pad("Estado", 8) + "Duración");
for (const f of files) console.log(pad(f.file, 58) + pad(f.tests, 7) + pad(f.status, 8) + fmt(f.ms));

console.log(`\nTests individuales más lentos (top 5):`);
for (const t of tests.slice(0, 5)) console.log(`  ${fmt(t.ms).padStart(8)}  ${t.name}`);

// Si corre dentro de GitHub Actions, deja la tabla en el resumen del job.
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = files.map((f) => `| ${f.file} | ${f.tests} | ${f.status} | ${fmt(f.ms)} |`).join("\n");
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Tiempos de tests (${suite})\n\nTiempo de pared: ${(wallMs / 1000).toFixed(2)} s\n\n| Archivo | Tests | Estado | Duración |\n|---|---|---|---|\n${rows}\n`,
  );
}

process.exit(run.status ?? 0);

