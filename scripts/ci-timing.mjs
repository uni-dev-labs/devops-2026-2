#!/usr/bin/env node
/**
 * Muestra la trazabilidad y los tiempos de una ejecución de CI en GitHub Actions.
 *
 * Requiere GitHub CLI (`gh`) autenticado. Para cada run imprime:
 *  commit -> rama -> pull request -> run -> jobs -> steps, con la duración de cada uno.
 *
 * Uso:
 *   npm run ci:timing                         -> último run de la rama actual
 *   npm run ci:timing -- --branch mi-rama     -> último run de esa rama
 *   npm run ci:timing -- --run 123456789      -> un run concreto
 *   npm run ci:timing -- --repo owner/repo    -> otro repositorio (por defecto uni-dev-labs/devops-2026-2)
 */
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const repo = opt("--repo", "uni-dev-labs/devops-2026-2");
const sh = (cmd) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
const secs = (a, b) => ((new Date(b) - new Date(a)) / 1000).toFixed(0).padStart(4) + " s";

let runId = opt("--run");
let branch = opt("--branch");
if (!runId) {
  branch ??= sh("git rev-parse --abbrev-ref HEAD");
  let list = [];
  try {
    list = JSON.parse(sh(`gh run list -R ${repo} --branch ${branch} --limit 1 --json databaseId`));
  } catch (err) {
    // Si no encuentra en la rama actual, intentar con la rama base anterior
  }
  if (!list.length) {
    console.error(`No hay runs de CI para la rama "${branch}" en ${repo}.`);
    console.error(`Tip: puedes consultar el run de la rama base con:`);
    console.error(`  npm run ci:timing -- --branch products-test-alarcon`);
    console.error(`o consultar por ID con:`);
    console.error(`  npm run ci:timing -- --run 40250745639`);
    process.exit(1);
  }
  runId = list[0].databaseId;
}

const run = JSON.parse(
  sh(`gh run view ${runId} -R ${repo} --json url,displayTitle,headSha,headBranch,event,status,conclusion,createdAt,updatedAt,jobs`),
);
branch ??= run.headBranch;

let pr = null;
try {
  const prs = JSON.parse(sh(`gh pr list -R ${repo} --state all --head ${branch} --json number,url,title,state`));
  pr = prs[0] ?? null;
} catch { /* sin PR */ }

console.log("=== Trazabilidad y Tiempos de CI/CD ===");
console.log(`Commit : ${run.headSha}`);
console.log(`Rama   : ${run.headBranch}`);
console.log(`PR     : ${pr ? `#${pr.number} (${pr.state}) ${pr.url}` : "sin pull request asociado"}`);
console.log(`Run    : ${run.url}`);
console.log(`Evento : ${run.event} | Estado: ${run.status}/${run.conclusion}`);
console.log(`Total  : ${secs(run.createdAt, run.updatedAt)}  (${run.createdAt} -> ${run.updatedAt})\n`);

for (const job of run.jobs) {
  console.log(`Job "${job.name}" [${job.conclusion}]  ${secs(job.startedAt, job.completedAt)}`);
  for (const s of job.steps ?? []) {
    console.log(`   ${secs(s.startedAt, s.completedAt)}  ${s.name}`);
  }
  console.log("");
}

