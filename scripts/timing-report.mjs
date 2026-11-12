import fs from "node:fs";
import path from "node:path";

const inputFiles = process.argv.slice(2);
const outputFile = "tiempos_servicios_testing.txt";

if (inputFiles.length === 0) {
  console.error("Uso: node scripts/timing-report.mjs <archivo1.json> [archivo2.json ...]");
  process.exit(1);
}

const lines = [
  "====================================================================",
  `REPORTE DE TIEMPOS DE EJECUCIÓN POR SERVICIO (TESTS QUE PASAN)`,
  `Fecha de ejecución: ${new Date().toLocaleString("es-CO")}`,
  "====================================================================",
  "",
];

let totalGlobalMs = 0;
let totalPassedTests = 0;

for (const file of inputFiles) {
  if (!fs.existsSync(file)) continue;

  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  const suites = report.testResults ?? [];

  for (const suite of suites) {
    const fileName = path.basename(suite.name);
    const passedAssertions = (suite.assertionResults ?? []).filter(
      (t) => t.status === "passed"
    );

    if (passedAssertions.length === 0) continue;

    // Suma de la duración exacta de los tests que pasaron en este servicio
    const serviceDurationMs = passedAssertions.reduce(
      (acc, t) => acc + (t.duration ?? 0),
      0
    );

    totalGlobalMs += serviceDurationMs;
    totalPassedTests += passedAssertions.length;

    lines.push(`SERVICIO / SUITE: ${fileName}`);
    lines.push(`- Tests aprobados: ${passedAssertions.length}`);
    lines.push(`- Tiempo total del servicio: ${serviceDurationMs.toFixed(2)} ms`);
    lines.push("- Desglose por caso de prueba:");

    for (const test of passedAssertions) {
      const duration = (test.duration ?? 0).toFixed(2);
      lines.push(`    * [PASS] ${test.title} -> ${duration} ms`);
    }
    lines.push("");
  }
}

lines.push("--------------------------------------------------------------------");
lines.push(`RESUMEN GENERAL:`);
lines.push(`- Total tests aprobados: ${totalPassedTests}`);
lines.push(`- Tiempo acumulado de todos los servicios: ${totalGlobalMs.toFixed(2)} ms`);
lines.push("====================================================================");

fs.writeFileSync(outputFile, lines.join("\n"), "utf8");
console.log(`Reporte actualizado correctamente en: ${outputFile}`);