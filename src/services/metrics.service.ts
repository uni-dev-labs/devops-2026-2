export type ServiceName = "api" | "postgres" | "mongo";

export interface Sample {
  durationMs: number;
  ok: boolean;
  at: number;
}

export interface ServiceStats {
  service: ServiceName;
  count: number;
  errors: number;
  errorRate: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p95Ms: number;
  requestPerMinute: number;
  loadShare: number;
  status: "ok" | "degraded" | "idle";
}

const Max_SAMPLES = 1000;
const SERVICES: ServiceName[] = ["api", "postgres", "mongo"];

const samples = new Map<ServiceName, Sample[]>(SERVICES.map((s) => [s, []]));

export function recordSample(service: ServiceName, durationMs: number, ok: boolean): void {
  const list = samples.get(service)!;
  list.push({ durationMs, ok, at: Date.now() });
  if (list.length > Max_SAMPLES) list.shift();
}

export async function measure<T>(service: ServiceName, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    recordSample(service, performance.now() - start, true);
    return result;
  } catch (error) {
    recordSample(service, performance.now() - start, false);
    throw error;
  }
}

export function getStats(service: ServiceName): ServiceStats {
  const list = samples.get(service) ?? [];
  const count = list.length;

  let totalAllSamples = 0;
  for (const s of SERVICES) {
    totalAllSamples += samples.get(s)?.length ?? 0;
  }

  if (count === 0) {
    return {
      service,
      count: 0,
      errors: 0,
      errorRate: 0,
      avgMs: 0,
      minMs: 0,
      maxMs: 0,
      p95Ms: 0,
      requestPerMinute: 0,
      loadShare: 0,
      status: "idle",
    };
  }

  const errors = list.filter((s) => !s.ok).length;
  const errorRate = Number(((errors / count) * 100).toFixed(2));

  const durations = list.map((s) => s.durationMs).sort((a, b) => a - b);
  const sumMs = durations.reduce((acc, val) => acc + val, 0);

  const avgMs = Number((sumMs / count).toFixed(2));
  const minMs = Number(durations[0].toFixed(2));
  const maxMs = Number(durations[durations.length - 1].toFixed(2));

  const p95Index = Math.ceil(count * 0.95) - 1;
  const p95Ms = Number(durations[Math.max(0, p95Index)].toFixed(2));

  const oneMinuteAgo = Date.now() - 60_000;
  const requestPerMinute = list.filter((s) => s.at >= oneMinuteAgo).length;

  const loadShare =
    totalAllSamples > 0 ? Number(((count / totalAllSamples) * 100).toFixed(2)) : 0;

  const status = errorRate > 10 ? "degraded" : "ok";

  return {
    service,
    count,
    errors,
    errorRate,
    avgMs,
    minMs,
    maxMs,
    p95Ms,
    requestPerMinute,
    loadShare,
    status,
  };
}

export function resetMetrics(): void {
  for (const list of samples.values()) list.length = 0;
}

export function getAllStats(): ServiceStats[] {
  return SERVICES.map(getStats);
}
