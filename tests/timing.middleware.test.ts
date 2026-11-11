import { EventEmitter } from "node:events";
import { performance } from "node:perf_hooks";
import { describe, it, expect, vi, afterEach } from "vitest";

import { measureDuration, timingMiddleware } from "../src/middleware/timing.middleware.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("timing middleware", () => {
  it("logs request duration when the response finishes", () => {
    const nowSpy = vi.spyOn(performance, "now").mockReturnValueOnce(1000).mockReturnValueOnce(1050.42);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const req = { method: "GET", originalUrl: "/health" } as any;
    const res = new EventEmitter() as any;
    const next = vi.fn();

    res.statusCode = 200;

    timingMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);

    res.emit("finish");

    expect(nowSpy).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenCalledWith("[timing] GET /health 200 50.42 ms");
  });

  it("measures an async operation duration and returns its value", async () => {
    const nowSpy = vi.spyOn(performance, "now").mockReturnValueOnce(2000).mockReturnValueOnce(2023.4);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await measureDuration("demo-operation", async () => "ok");

    expect(result).toBe("ok");
    expect(nowSpy).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenCalledWith("[timing] demo-operation: 23.4 ms");
  });

  it("still logs the duration when the async operation fails", async () => {
    const nowSpy = vi.spyOn(performance, "now").mockReturnValueOnce(3000).mockReturnValueOnce(3015.75);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      measureDuration("failed-operation", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(nowSpy).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenCalledWith("[timing] failed-operation: 15.75 ms");
  });
});
