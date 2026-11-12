import { performance } from "node:perf_hooks";
import { Router, type Request, type Response } from "express";
import { pgPool } from "../db/postgres.js";
import { getMongoDb } from "../db/mongo.js";
import { parsePagination } from "../services/pagination.service.js";
import { ProductStore } from "../services/product-store.js";

export const performanceRouter = Router();

type Measurement = {
  service: string;
  operation: string;
  status: "ok" | "error";
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  message?: string;
};

const DEFAULT_ITERATIONS = 1000;
const MAX_ITERATIONS = 10000;
const LIST_ITERATIONS = 100;
const DB_ITERATIONS = 20;

// Lee ?iterations del query string; si no sirve, usa el valor por defecto.
function toIterations(value: unknown): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_ITERATIONS) : DEFAULT_ITERATIONS;
}

const round = (ms: number) => Number(ms.toFixed(4));

// Ejecuta la operación varias veces y mide cuánto tarda cada ejecución con performance.now().
async function measure(
  service: string,
  operation: string,
  iterations: number,
  run: (i: number) => unknown,
): Promise<Measurement> {
  const times: number[] = [];

  try {
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await run(i);
      times.push(performance.now() - start);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      service,
      operation,
      status: "error",
      iterations: times.length,
      totalMs: 0,
      avgMs: 0,
      minMs: 0,
      maxMs: 0,
      message,
    };
  }

  const totalMs = times.reduce((sum, t) => sum + t, 0);
  return {
    service,
    operation,
    status: "ok",
    iterations,
    totalMs: round(totalMs),
    avgMs: round(totalMs / iterations),
    minMs: round(Math.min(...times)),
    maxMs: round(Math.max(...times)),
  };
}

// Crea un almacén con n productos para medir las lecturas sobre datos reales.
function seedStore(n: number) {
  const store = new ProductStore();
  const products = Array.from({ length: n }, (_, i) =>
    store.create({
      name: `Producto ${i}`,
      sku: `SKU-${i}`,
      price: i + 1,
      stock: 10,
      category: "Bench",
    }),
  );
  return { store, products };
}

// GET /api/performance?iterations=1000 → mide el tiempo de cada servicio del proyecto
performanceRouter.get("/", async (req: Request, res: Response) => {
  const iterations = toIterations(req.query.iterations);
  const results: Measurement[] = [];

  // Servicio de paginación
  results.push(
    await measure("pagination.service", "parsePagination", iterations, (i) =>
      parsePagination({ page: String(i + 1), limit: "20" }),
    ),
  );

  // Servicio ProductStore (en memoria)
  const empty = new ProductStore();
  results.push(
    await measure("product-store", "create", iterations, (i) =>
      empty.create({ name: `Producto ${i}`, sku: `SKU-${i}`, price: 100 }),
    ),
  );

  const { store, products } = seedStore(iterations);
  const listIterations = Math.min(iterations, LIST_ITERATIONS);
  results.push(
    await measure("product-store", "getById", iterations, (i) => store.getById(products[i]!.id)),
    await measure("product-store", "getBySku", iterations, (i) => store.getBySku(`sku-${i}`)),
    // list ordena todo el almacén en cada llamada, por eso se limita a LIST_ITERATIONS
    await measure("product-store", "list", listIterations, () => store.list()),
    await measure("product-store", "list (filtros)", listIterations, () =>
      store.list({ search: "producto 1", category: "bench", minPrice: 10, maxPrice: 500 }),
    ),
    await measure("product-store", "update", iterations, (i) =>
      store.update(products[i]!.id, { price: i + 2 }),
    ),
    await measure("product-store", "adjustStock", iterations, (i) =>
      store.adjustStock(products[i]!.id, 1),
    ),
    await measure("product-store", "remove", iterations, (i) => store.remove(products[i]!.id)),
  );

  // Bases de datos: menos iteraciones porque cada consulta viaja por la red.
  // La tabla users se crea antes (fuera de la medición), igual que en postgres.routes.ts.
  await pgPool
    .query(
      `CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
    )
    .catch(() => undefined);

  results.push(
    await measure("postgresql", "SELECT NOW()", DB_ITERATIONS, () =>
      pgPool.query("SELECT NOW() AS now"),
    ),
    await measure("postgresql", "SELECT users", DB_ITERATIONS, () =>
      pgPool.query("SELECT id, name, email FROM users ORDER BY id ASC LIMIT 10"),
    ),
    await measure("mongodb", "ping", DB_ITERATIONS, () => getMongoDb().command({ ping: 1 })),
    await measure("mongodb", "find users", DB_ITERATIONS, () =>
      getMongoDb().collection("users").find({}).limit(10).toArray(),
    ),
    await measure("mongodb", "find products", DB_ITERATIONS, () =>
      getMongoDb().collection("products").find({}).limit(10).toArray(),
    ),
  );

  console.table(
    results.map(({ service, operation, status, iterations, avgMs, minMs, maxMs, totalMs }) => ({
      service,
      operation,
      status,
      iterations,
      avgMs,
      minMs,
      maxMs,
      totalMs,
    })),
  );

  res.json({ iterations, unit: "ms", count: results.length, data: results });
});
