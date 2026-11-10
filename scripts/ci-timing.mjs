#!/usr/bin/env node
/**
 * Muestra la trazabilidad y los tiempos de una ejecución de CI en GitHub Actions.
 *
 * Muestra la cadena de trazabilidad completa:
 *  commit -> rama -> pull request -> run -> jobs -> steps, con la duración de cada uno.
 *
 * Consulta la API de GitHub (y usa GitHub CLI `gh` si está disponible).
 *
 * Uso:
 *   npm run ci:timing                         -> último run de la rama actual (o rama base de referencia)
 *   npm run ci:timing -- --branch mi-rama     -> último run de esa rama
 *   npm run ci:timing -- --run 123456789      -> un run concreto (ej. 40221362842 o 39802513841)
 *   npm run ci:timing -- --repo owner/repo    -> otro repositorio (por defecto uni-dev-labs/devops-2026-2)
 */
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const repo = opt("--repo", "uni-dev-labs/devops-2026-2");
const requestedBranch = opt("--branch");
let runId = opt("--run");

const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) devops-ci-timing",
  "Accept": "application/vnd.github+json",
};
if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) {
  headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN || process.env.GH_TOKEN}`;
}

const secs = (a, b) => {
  if (!a || !b) return "   - s";
  return ((new Date(b) - new Date(a)) / 1000).toFixed(0).padStart(4) + " s";
};

const getGitBranch = () => {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "products-test-preciado";
  }
};

async function fetchJson(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText} (${url})`);
  }
  return await res.json();
}

async function findLatestRunForBranch(targetBranch) {
  try {
    const data = await fetchJson(`https://api.github.com/repos/${repo}/actions/runs?branch=${encodeURIComponent(targetBranch)}&per_page=5`);
    if (data.workflow_runs && data.workflow_runs.length > 0) {
      return data.workflow_runs[0];
    }
  } catch {
    // Si falla la búsqueda directa por branch en el endpoint de runs, busca en los runs generales
  }

  try {
    const data = await fetchJson(`https://api.github.com/repos/${repo}/actions/runs?per_page=30`);
    const match = data.workflow_runs?.find((r) => r.head_branch === targetBranch);
    if (match) return match;
  } catch {}

  return null;
}

async function findPrForBranch(targetBranch) {
  try {
    const prs = await fetchJson(`https://api.github.com/repos/${repo}/pulls?state=all&per_page=100`);
    const pr = prs.find((p) => p.head?.ref === targetBranch || p.head?.label?.endsWith(`:${targetBranch}`));
    return pr ?? null;
  } catch {
    return null;
  }
}

async function main() {
  let branch = requestedBranch || getGitBranch();
  let runData = null;

  if (runId) {
    runData = await fetchJson(`https://api.github.com/repos/${repo}/actions/runs/${runId}`);
  } else {
    runData = await findLatestRunForBranch(branch);

    if (!runData) {
      if (requestedBranch) {
        console.error(`No hay runs de CI para la rama "${requestedBranch}" en ${repo}. ¿Ya abriste el pull request?`);
        process.exit(1);
      }

      // Si es una rama local recién creada (p. ej. trazabilidad-Preciado-Johan) y aún no tiene runs en Actions,
      // mostramos de referencia el run de la rama base 'products-test-preciado' (PR #85)
      console.log(`ℹ  Rama actual: "${branch}" (aún sin runs en GitHub Actions).`);
      console.log(`ℹ  Consultando trazabilidad de la rama base "products-test-preciado" (PR #85, run 40221362842)...\n`);
      branch = "products-test-preciado";
      runId = "40221362842";
      runData = await fetchJson(`https://api.github.com/repos/${repo}/actions/runs/${runId}`);
    }
  }

  const actualRunId = runData.id;
  const jobsData = await fetchJson(`https://api.github.com/repos/${repo}/actions/runs/${actualRunId}/jobs`);
  const pr = await findPrForBranch(runData.head_branch);

  console.log("=== Trazabilidad ===");
  console.log(`Commit : ${runData.head_sha}`);
  console.log(`Rama   : ${runData.head_branch}`);
  console.log(`PR     : ${pr ? `#${pr.number} (${pr.state}) ${pr.html_url}` : "sin pull request asociado"}`);
  console.log(`Run    : ${runData.html_url}`);
  console.log(`Evento : ${runData.event} | estado: ${runData.status}/${runData.conclusion}`);
  console.log(`Total  : ${secs(runData.created_at, runData.updated_at)}  (${runData.created_at} -> ${runData.updated_at})\n`);

  for (const job of jobsData.jobs || []) {
    console.log(`Job "${job.name}" [${job.conclusion}]  ${secs(job.started_at, job.completed_at)}`);
    for (const s of job.steps || []) {
      console.log(`   ${secs(s.started_at, s.completed_at)}  ${s.name}`);
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error("Error al obtener trazabilidad de CI:", err.message);
  process.exit(1);
});

