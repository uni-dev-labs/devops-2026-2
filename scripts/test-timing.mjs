import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const isProductos = process.argv.includes("--productos");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-timing-"));
const reportPath = path.join(tempDir, "results.json");
const vitestCli = fileURLToPath(
  new URL("../node_modules/vitest/vitest.mjs", import.meta.url),
);
const args = ["run"];

if (isProductos) {
  args.push("--config", "vitest.productos.config.ts");
}

args.push("--reporter=default", "--reporter=json", "--outputFile", reportPath);

function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs)) {
    return "N/D";
  }
  return durationMs >= 1000
    ? `${(durationMs / 1000).toFixed(2)} s`
    : `${durationMs.toFixed(1)} ms`;
}

function durationBetween(start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return Number.NaN;
  }
  return end - start;
}

function printTimings(report, totalDurationMs) {
  const testResults = Array.isArray(report.testResults) ? report.testResults : [];
  const assertions = testResults.flatMap((result) =>
    Array.isArray(result.assertionResults) ? result.assertionResults : [],
  );
  const slowestTests = assertions
    .filter((test) => Number.isFinite(test.duration))
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 10);

  console.log(`\nTiempos de ${isProductos ? "tests de productos" : "tests"}:`);
  console.log(`Duración total del proceso: ${formatDuration(totalDurationMs)}`);
  console.log(
    `Resultado: ${report.numPassedTests ?? 0}/${report.numTotalTests ?? 0} tests pasaron; ` +
      `${report.numFailedTests ?? 0} fallaron.`,
  );

  console.log("\nDuración por archivo:");
  for (const result of testResults) {
    const durationMs = durationBetween(result.startTime, result.endTime);
    console.log(`- ${result.name}: ${formatDuration(durationMs)}`);
  }

  console.log("\nTests más lentos:");
  if (slowestTests.length === 0) {
    console.log("- No hay duraciones de tests disponibles.");
    return;
  }
  for (const test of slowestTests) {
    console.log(`- ${formatDuration(test.duration)}: ${test.fullName ?? test.title}`);
  }
}

const startedAt = performance.now();
let exitCode = 1;

try {
  exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [vitestCli, ...args], {
      stdio: "inherit",
      shell: false,
    });

    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });

  const totalDurationMs = performance.now() - startedAt;
  if (!fs.existsSync(reportPath)) {
    throw new Error("Vitest terminó sin generar el reporte JSON de tiempos.");
  }

  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  printTimings(report, totalDurationMs);
} catch (error) {
  console.error(`No se pudieron obtener los tiempos de Vitest: ${error.message}`);
  exitCode = 1;
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

process.exitCode = exitCode;
