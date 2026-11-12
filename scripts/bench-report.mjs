#!/usr/bin/env node
/**
 * Compara dos corridas de benchmarks guardadas en reports/bench/<etiqueta>/.
 *
 *   node scripts/bench-report.mjs            → compara "antes" contra "despues"
 *   node scripts/bench-report.mjs a b        → compara las etiquetas a y b
 *
 * Imprime tablas Markdown y las guarda en reports/bench/comparacion.md.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [base = "antes", next = "despues"] = process.argv.slice(2);
const root = join("reports", "bench");

function load(label) {
  const dir = join(root, label);
  if (!existsSync(dir)) {
    console.error(`No existe ${dir}. Corre primero: BENCH_LABEL=${label} npm run bench`);
    process.exit(1);
  }
  return Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const data = JSON.parse(readFileSync(join(dir, f), "utf8"));
        return [data.group, data];
      }),
  );
}

const fmtUs = (us) => (us >= 1000 ? `${(us / 1000).toFixed(2)} ms` : `${us.toFixed(3)} µs`);
const fmtOps = (n) => n.toLocaleString("es-CO");

function speedup(before, after) {
  const x = before / after;
  if (x >= 1.15) return `**${x.toFixed(x >= 10 ? 0 : 1)}× más rápido**`;
  if (x <= 0.87) return `${(1 / x).toFixed(1)}× más lento`;
  return "≈ igual";
}

const a = load(base);
const b = load(next);
const order = (g) => {
  const m = g.match(/store-(\d+)-(\w+)/);
  return m ? Number(m[1]) * 10 + (m[2] === "lecturas" ? 0 : 1) : -1;
};

let out = `# Benchmarks: \`${base}\` vs \`${next}\`\n\n`;
out += `Node ${Object.values(b)[0]?.node ?? "?"} · tiempo medio por operación (menor es mejor)\n`;

for (const group of Object.keys(b).sort((x, y) => order(x) - order(y))) {
  out += `\n## ${group}\n\n| Operación | ${base} | ${next} | ops/s ${next} | Cambio |\n|---|---:|---:|---:|---|\n`;
  for (const row of b[group].rows) {
    const old = a[group]?.rows.find((r) => r.name === row.name);
    out += `| ${row.name} | ${old ? fmtUs(old.meanUs) : "—"} | ${fmtUs(row.meanUs)} | ${fmtOps(row.opsPerSec)} | ${
      old ? speedup(old.meanUs, row.meanUs) : "nuevo"
    } |\n`;
  }
}

writeFileSync(join(root, "comparacion.md"), out);
console.log(out);
