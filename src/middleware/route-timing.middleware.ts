import { performance } from "node:perf_hooks";
import type { NextFunction, Request, Response } from "express";

export function routeTimingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = performance.now();

  res.on("finish", () => {
    const durationMs = performance.now() - start;
    console.log(
      `[route-timing] ${req.method} ${req.path} | ${res.statusCode} | ${durationMs.toFixed(2)} ms`,
    );
  });

  next();
}
