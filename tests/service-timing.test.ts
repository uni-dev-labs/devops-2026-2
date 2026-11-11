import { describe, it, expect } from "vitest";
import { parsePagination } from "../src/services/pagination.service.js";
import { ProductStore } from "../src/services/product-store.js";

/**
 * Función utilitaria para medir la duración de una función y calcular estadísticas.
 */
function measureExecutionTime<T>(fn: () => T, iterations: number = 1000) {
  // Calentamiento
  for (let i = 0; i < 50; i += 1) {
    fn();
  }

  const times: number[] = new Array(iterations);
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    fn();
    const end = performance.now();
    times[i] = end - start;
  }

  times.sort((a, b) => a - b);
  const total = times.reduce((acc, t) => acc + t, 0);
  const mean = total / iterations;
  const min = times[0];
  const max = times[iterations - 1];
  const p50 = times[Math.floor(iterations * 0.5)];
  const p95 = times[Math.floor(iterations * 0.95)];
  const p99 = times[Math.floor(iterations * 0.99)];

  return { iterations, mean, min, max, p50, p95, p99 };
}

describe("Medición de tiempos de ejecución de los servicios", () => {
  describe("pagination.service", () => {
    it("parsePagination ejecuta en promedio en menos de 0.05 ms", () => {
      const stats = measureExecutionTime(() => {
        parsePagination({ page: "3", limit: "25" });
      }, 2000);

      expect(stats.mean).toBeLessThan(0.05);
      expect(stats.p95).toBeLessThan(0.1);
      expect(stats.min).toBeGreaterThanOrEqual(0);
    });

    it("parsePagination con parámetros por defecto ejecuta en menos de 0.02 ms", () => {
      const stats = measureExecutionTime(() => {
        parsePagination();
      }, 2000);

      expect(stats.mean).toBeLessThan(0.05);
      expect(stats.p50).toBeLessThan(0.02);
    });
  });

  describe("product-store", () => {
    it("operaciones O(1) de lectura (getById y getBySku) ejecutan en promedio en menos de 0.05 ms", () => {
      const store = new ProductStore();
      for (let i = 0; i < 500; i += 1) {
        store.create({
          name: `Producto ${i}`,
          sku: `SKU-${i}`,
          price: 100 + i,
          category: "General",
        });
      }
      const target = store.getBySku("SKU-250")!;

      const statsById = measureExecutionTime(() => {
        store.getById(target.id);
      }, 1000);

      const statsBySku = measureExecutionTime(() => {
        store.getBySku("sku-250");
      }, 1000);

      expect(statsById.mean).toBeLessThan(0.05);
      expect(statsBySku.mean).toBeLessThan(0.05);
    });

    it("operaciones de escritura (update y adjustStock) ejecutan en promedio en menos de 0.05 ms", () => {
      const store = new ProductStore();
      const p = store.create({ name: "Leche", sku: "LEC-1", price: 3000, stock: 10 });

      const statsUpdate = measureExecutionTime(() => {
        store.update(p.id, { price: 3200 });
      }, 1000);

      const statsStock = measureExecutionTime(() => {
        store.adjustStock(p.id, 1);
        store.adjustStock(p.id, -1);
      }, 1000);

      expect(statsUpdate.mean).toBeLessThan(0.05);
      expect(statsStock.mean).toBeLessThan(0.05);
    });

    it("list() con 500 productos ejecuta en menos de 50 ms debido al ordenamiento con localeCompare", () => {
      const store = new ProductStore();
      const categories = ["Lacteos", "Bebidas", "Abarrotes"];
      for (let i = 0; i < 500; i += 1) {
        store.create({
          name: `Item ${i}`,
          sku: `ITM-${i}`,
          price: (i % 20) * 500,
          category: categories[i % categories.length],
        });
      }

      const statsListAll = measureExecutionTime(() => {
        store.list();
      }, 50);

      const statsListFiltered = measureExecutionTime(() => {
        store.list({ category: "bebidas", minPrice: 1000, maxPrice: 5000 });
      }, 50);

      expect(statsListAll.mean).toBeLessThan(50.0);
      expect(statsListFiltered.mean).toBeLessThan(50.0);
    });
  });
});
