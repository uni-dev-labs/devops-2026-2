import { describe, it, expect, beforeEach } from "vitest";
import { recordSample, getStats, resetMetrics, measure } from "../src/services/metrics.service.js";

describe("metrics.service", () => {
  beforeEach(() => resetMetrics());

  it("calcula promedio, min y max", () => {
    [10, 20, 30].forEach((ms) => recordSample("mongo", ms, true));
    const s = getStats("mongo");
    expect(s.count).toBe(3);
    expect(s.avgMs).toBe(20);
    expect(s.minMs).toBe(10);
    expect(s.maxMs).toBe(30);
  });

  it("calcula la tasa de error", () => {
    recordSample("postgres", 5, true);
    recordSample("postgres", 5, false);
    expect(getStats("postgres").errorRate).toBe(50);
  });

  it("devuelve idle sin muestras", () => {
    expect(getStats("api").status).toBe("idle");
  });

  it("measure registra error y relanza la excepción", async () => {
    await expect(measure("mongo", async () => { throw new Error("x"); })).rejects.toThrow("x");
    expect(getStats("mongo").errors).toBe(1);
  });
});
