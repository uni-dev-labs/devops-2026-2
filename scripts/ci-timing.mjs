import { execFileSync } from "node:child_process";

const apiBase = "https://api.github.com";
const commitArgument = process.argv[2];

function runGit(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function parseGitHubRemote(remote) {
  const match =
    remote.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/) ??
    remote.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);

  if (!match) {
    throw new Error(`No se pudo interpretar el remoto de GitHub: ${remote}`);
  }

  return { owner: match[1], repository: match[2] };
}

function formatDuration(start, end) {
  if (!start || !end) {
    return "en curso / no disponible";
  }

  const durationMs = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return "no disponible";
  }
  return `${(durationMs / 1000).toFixed(1)} s`;
}

async function githubRequest(url) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "devops-ci-timing",
  };
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `GitHub API respondió ${response.status} ${response.statusText} para ${url}` +
        (details ? `: ${details}` : ""),
    );
  }
  return response.json();
}

async function main() {
  const commit = commitArgument ?? runGit(["rev-parse", "HEAD"]);
  if (!/^[\da-f]{7,40}$/i.test(commit)) {
    throw new Error("Indica un SHA de commit válido (7 a 40 caracteres hexadecimales).");
  }

  const remote = runGit(["remote", "get-url", "origin"]);
  const { owner, repository } = parseGitHubRemote(remote);
  const repoApi = `${apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
  const commitUrl = `${repoApi}/commits/${encodeURIComponent(commit)}`;
  const [commitInfo, pullRequests] = await Promise.all([
    githubRequest(commitUrl),
    githubRequest(`${commitUrl}/pulls`),
  ]);
  const runsResponse = await githubRequest(
    `${repoApi}/actions/runs?head_sha=${encodeURIComponent(commitInfo.sha)}&per_page=100`,
  );
  const runs = (runsResponse.workflow_runs ?? [])
    .filter((run) => run.head_sha.toLowerCase() === commitInfo.sha.toLowerCase())
    .sort(
      (a, b) =>
        Date.parse(b.run_started_at ?? b.created_at) -
        Date.parse(a.run_started_at ?? a.created_at),
    );
  const run = runs[0];
  const branch =
    run?.head_branch ??
    pullRequests[0]?.head?.ref ??
    (commitInfo.sha === runGit(["rev-parse", "HEAD"])
      ? runGit(["branch", "--show-current"]) || "rama no disponible"
      : "rama no disponible");

  console.log(`Commit: ${commitInfo.sha}`);
  console.log(`Repositorio: ${owner}/${repository}`);
  console.log(`Rama: ${branch}`);

  console.log("\nPR:");
  if (pullRequests.length === 0) {
    console.log("- No se encontró un PR asociado a este commit.");
  } else {
    for (const pullRequest of pullRequests) {
      console.log(
        `- #${pullRequest.number} ${pullRequest.title} (${pullRequest.html_url})`,
      );
    }
  }

  console.log("\nWorkflow run:");
  if (!run) {
    console.log("- No se encontró una corrida de Actions para este commit.");
    return;
  }

  console.log(
    `- ${run.name} #${run.run_number}: ${run.conclusion ?? run.status}; ` +
      `${formatDuration(run.run_started_at, run.updated_at)}`,
  );
  console.log(`- ${run.html_url}`);

  const jobsResponse = await githubRequest(`${run.jobs_url}?per_page=100`);
  const jobs = jobsResponse.jobs ?? [];
  console.log("\nJobs y steps:");
  for (const job of jobs) {
    console.log(
      `- ${job.name}: ${job.conclusion ?? job.status}; ` +
        `${formatDuration(job.started_at, job.completed_at)}`,
    );
    for (const step of job.steps ?? []) {
      console.log(
        `  - ${step.name}: ${step.conclusion ?? step.status}; ` +
          `${formatDuration(step.started_at, step.completed_at)}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(`No se pudo trazar el CI: ${error.message}`);
  process.exitCode = 1;
});
