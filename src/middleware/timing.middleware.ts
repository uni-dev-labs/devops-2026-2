import { performance } from "node:perf_hooks";
import type { NextFunction, Request, Response } from "express";

/** Measures each HTTP request from middleware entry until the response finishes. */
export function timingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startedAt = performance.now();

  res.once("finish", () => {
    const elapsedMs = Number((performance.now() - startedAt).toFixed(2));
    console.log(
      `[timing] ${req.method} ${req.originalUrl} ${res.statusCode} ${elapsedMs} ms`
    );
  });

  next();
}

/** Runs an async operation and reports its elapsed time, even when it fails. */
export async function measureDuration<T>(
  label: string,
  operation: () => Promise<T>
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    const elapsedMs = Number((performance.now() - startedAt).toFixed(2));
    console.log(`[timing] ${label}: ${elapsedMs} ms`);
  }
}
