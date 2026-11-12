import { Router, type Request, type Response } from "express";
import type { Trace } from "./trace-context.js";
import type { TraceStore } from "./trace-store.js";
import { round } from "./tracer.js";

type RouteStats = {
  route: string;
  count: number;
  errors: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

/** Agrupa por "MÉTODO /ruta" (sin query string) y calcula latencias. */
export function summarize(traces: Trace[]): RouteStats[] {
  const groups = new Map<string, Trace[]>();
  for (const t of traces) {
    const key = `${t.method} ${t.path.split("?")[0]}`;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .map(([route, list]) => {
      const durations = list.map((t) => t.durationMs ?? 0).sort((a, b) => a - b);
      const total = durations.reduce((sum, d) => sum + d, 0);
      return {
        route,
        count: list.length,
        errors: list.filter((t) => (t.statusCode ?? 0) >= 500).length,
        avgMs: round(total / durations.length),
        p50Ms: percentile(durations, 50),
        p95Ms: percentile(durations, 95),
        maxMs: durations[durations.length - 1],
      };
    })
    .sort((a, b) => b.p95Ms - a.p95Ms);
}

export function tracesRouter(store: TraceStore) {
  const router = Router();
  // Las consultas a este router no se mezclan con las trazas que se están analizando.
  const own = (t: Trace) => !t.path.startsWith("/api/traces");

  router.get("/", (req: Request, res: Response) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 200);
    const data = store.recent(store.size).filter(own).slice(0, limit);
    res.json({ count: data.length, data });
  });

  router.get("/stats", (_req: Request, res: Response) => {
    const traces = store.recent(store.size).filter(own);
    res.json({ sampled: traces.length, routes: summarize(traces) });
  });

  router.get("/:traceId", (req: Request, res: Response) => {
    const trace = store.get(String(req.params.traceId));
    if (!trace) {
      res.status(404).json({ message: "Trace not found", code: "NOT_FOUND" });
      return;
    }
    res.json(trace);
  });

  router.delete("/", (_req: Request, res: Response) => {
    store.clear();
    res.status(204).end();
  });

  return router;
}
