#!/usr/bin/env node
/**
 * Prueba de carga contra la API levantada (por ejemplo con `npm run docker:up`).
 *
 *   node scripts/medir-endpoints.mjs [--url http://localhost:3000] [--requests 500]
 *                                    [--concurrency 10] [--label actual] [--docker-stats]
 *
 * Por cada endpoint mide la latencia (promedio, p50, p95, p99, máx), el throughput y los errores.
 * Además lee el header Server-Timing de cada respuesta para saber cuánto de esa latencia se
 * fue en cada tramo (consulta a Postgres, a Mongo, paginación...). Ese desglose es la
 * trazabilidad: permite decir *dónde* se va el tiempo, no solo cuánto tarda.
 *
 * Guarda reports/endpoints/<label>.json y reports/endpoints/<label>.md.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const BASE = opt("url", "http://localhost:3000");
const REQUESTS = Number(opt("requests", 500));
const CONCURRENCY = Number(opt("concurrency", 10));
const LABEL = opt("label", "actual");
const WARMUP = 30;
const DOCKER_STATS = args.includes("--docker-stats");

const runId = randomUUID().slice(0, 8);
let seq = 0;

const ENDPOINTS = [
  { name: "GET /health", method: "GET", path: "/health" },
  { name: "GET /api/postgres/health", method: "GET", path: "/api/postgres/health" },
  { name: "GET /api/postgres/users", method: "GET", path: "/api/postgres/users?page=1&limit=10" },
  {
    name: "POST /api/postgres/users",
    method: "POST",
    path: "/api/postgres/users",
    body: () => ({ name: "Carga", email: `pg-${runId}-${seq++}@bench.test` }),
  },
  { name: "GET /api/mongo/health", method: "GET", path: "/api/mongo/health" },
  { name: "GET /api/mongo/users", method: "GET", path: "/api/mongo/users?page=1&limit=10" },
  {
    name: "POST /api/mongo/users",
    method: "POST",
    path: "/api/mongo/users",
    body: () => ({ name: "Carga", email: `mongo-${runId}-${seq++}@bench.test` }),
  },
  { name: "GET /api/products", method: "GET", path: "/api/products" },
  {
    name: "POST /api/products",
    method: "POST",
    path: "/api/products",
    body: () => ({ name: `Producto ${seq++}`, price: 9.99 }),
  },
];

// Server-Timing: s0;dur=1.2;desc="pg.selectUsers", total;dur=3.4
function parseServerTiming(header) {
  const spans = {};
  if (!header) return spans;
  for (const part of header.split(",")) {
    const dur = part.match(/dur=([\d.]+)/);
    const desc = part.match(/desc="([^"]+)"/);
    const name = desc ? desc[1] : part.split(";")[0].trim();
    if (dur) spans[name] = (spans[name] ?? 0) + Number(dur[1]);
  }
  return spans;
}

async function hit(endpoint, traceId) {
  const body = endpoint.body?.();
  const start = performance.now();
  const res = await fetch(BASE + endpoint.path, {
    method: endpoint.method,
    headers: { "X-Trace-Id": traceId, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  await res.arrayBuffer();
  return {
    ms: performance.now() - start,
    ok: res.status < 400,
    status: res.status,
    traceIdEcho: res.headers.get("x-trace-id") === traceId,
    spans: parseServerTiming(res.headers.get("server-timing")),
  };
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
const r2 = (n) => Math.round(n * 100) / 100;

async function measure(endpoint) {
  for (let i = 0; i < WARMUP; i++) await hit(endpoint, `warmup-${runId}-${i}`);

  const samples = [];
  let next = 0;
  const start = performance.now();
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < REQUESTS) {
        const i = next++;
        try {
          samples.push(await hit(endpoint, `bench-${runId}-${i}`));
        } catch (error) {
          samples.push({ ms: 0, ok: false, status: 0, traceIdEcho: false, spans: {}, error: String(error) });
        }
      }
    }),
  );
  const wallMs = performance.now() - start;

  const ok = samples.filter((s) => s.ok);
  const lat = ok.map((s) => s.ms).sort((a, b) => a - b);
  const spanTotals = {};
  for (const s of ok) for (const [k, v] of Object.entries(s.spans)) spanTotals[k] = (spanTotals[k] ?? 0) + v;
  const spans = Object.fromEntries(Object.entries(spanTotals).map(([k, v]) => [k, r2(v / ok.length)]));

  return {
    endpoint: endpoint.name,
    requests: samples.length,
    errors: samples.length - ok.length,
    statuses: [...new Set(samples.map((s) => s.status))],
    traceIdPropagated: samples.every((s) => s.traceIdEcho),
    reqPerSec: Math.round((samples.length / wallMs) * 1000),
    avgMs: r2(lat.reduce((a, b) => a + b, 0) / (lat.length || 1)),
    p50Ms: r2(pct(lat, 50) ?? 0),
    p95Ms: r2(pct(lat, 95) ?? 0),
    p99Ms: r2(pct(lat, 99) ?? 0),
    maxMs: r2(lat[lat.length - 1] ?? 0),
    serverSpansAvgMs: spans,
  };
}

const run = promisify(execFile);

// Convierte "67.4MiB" / "1.2GiB" / "800kB" a MiB.
function toMiB(text) {
  const m = text.trim().match(/([\d.]+)\s*([KMG]i?B|kB|B)/i);
  if (!m) return 0;
  const factor = { b: 1 / 1048576, kb: 1 / 1024, kib: 1 / 1024, mb: 1, mib: 1, gb: 1024, gib: 1024 }[
    m[2].toLowerCase()
  ];
  return Number(m[1]) * (factor ?? 1);
}

/**
 * Toma muestras de `docker stats` en paralelo mientras corre la carga y guarda el pico
 * de CPU y memoria de cada contenedor del stack.
 */
function startDockerSampler() {
  const peak = new Map();
  let running = true;
  const loop = (async () => {
    while (running) {
      try {
        const { stdout } = await run("docker", [
          "stats",
          "--no-stream",
          "--format",
          "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}",
        ]);
        for (const line of stdout.trim().split("\n")) {
          const [name, cpu, mem] = line.split("|");
          if (!name?.startsWith("devops-")) continue;
          const prev = peak.get(name) ?? { cpuPct: 0, memMiB: 0, samples: 0 };
          peak.set(name, {
            cpuPct: Math.max(prev.cpuPct, parseFloat(cpu)),
            memMiB: Math.max(prev.memMiB, toMiB(mem.split("/")[0])),
            samples: prev.samples + 1,
          });
        }
      } catch {
        return; // docker no disponible: se omite la sección de recursos
      }
    }
  })();
  return async () => {
    running = false;
    await loop;
    return [...peak.entries()].map(([container, v]) => ({
      container,
      peakCpuPct: r2(v.cpuPct),
      peakMemMiB: r2(v.memMiB),
      samples: v.samples,
    }));
  };
}

const health = await fetch(`${BASE}/health`).catch(() => null);
if (!health?.ok) {
  console.error(`La API no responde en ${BASE}. Levántala con: npm run docker:up`);
  process.exit(1);
}

console.log(`Midiendo ${BASE} · ${REQUESTS} peticiones por endpoint · concurrencia ${CONCURRENCY} · run ${runId}\n`);
const results = [];
const stopSampler = DOCKER_STATS ? startDockerSampler() : null;
for (const endpoint of ENDPOINTS) {
  const r = await measure(endpoint);
  results.push(r);
  console.log(
    `${r.endpoint.padEnd(28)} avg ${String(r.avgMs).padStart(6)} ms  p95 ${String(r.p95Ms).padStart(6)} ms  ` +
      `${String(r.reqPerSec).padStart(5)} req/s  errores ${r.errors}`,
  );
}
const stats = stopSampler ? await stopSampler() : [];

const report = {
  label: LABEL,
  date: new Date().toISOString(),
  runId,
  baseUrl: BASE,
  requestsPerEndpoint: REQUESTS,
  concurrency: CONCURRENCY,
  node: process.version,
  results,
  dockerStats: stats,
};

let md = `# Carga por endpoint (\`${LABEL}\`)\n\n`;
md += `${REQUESTS} peticiones por endpoint, concurrencia ${CONCURRENCY}, ${WARMUP} de calentamiento · ${report.date}\n\n`;
md += `| Endpoint | avg ms | p50 | p95 | p99 | máx | req/s | errores |\n|---|---:|---:|---:|---:|---:|---:|---:|\n`;
for (const r of results) {
  md += `| ${r.endpoint} | ${r.avgMs} | ${r.p50Ms} | ${r.p95Ms} | ${r.p99Ms} | ${r.maxMs} | ${r.reqPerSec} | ${r.errors} |\n`;
}
md += `\n## Desglose del servidor (Server-Timing, promedio en ms)\n\n| Endpoint | Tramos |\n|---|---|\n`;
for (const r of results) {
  const parts = Object.entries(r.serverSpansAvgMs).map(([k, v]) => `${k} ${v}`);
  md += `| ${r.endpoint} | ${parts.join(" · ")} |\n`;
}
if (stats.length) {
  md += `\n## Recursos (pico de docker stats durante la carga)\n\n| Contenedor | CPU pico | Memoria pico | Muestras |\n|---|---:|---:|---:|\n`;
  for (const s of stats) md += `| ${s.container} | ${s.peakCpuPct}% | ${s.peakMemMiB} MiB | ${s.samples} |\n`;
}

const dir = join("reports", "endpoints");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `${LABEL}.json`), JSON.stringify(report, null, 2));
writeFileSync(join(dir, `${LABEL}.md`), md);
console.log(`\nGuardado en ${dir}/${LABEL}.md y ${LABEL}.json`);
