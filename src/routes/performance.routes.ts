import { Router, type Request, type Response } from "express";
import { performance } from "node:perf_hooks";
import { pgPool } from "../db/postgres.js";
import { getMongoDb } from "../db/mongo.js";
import { parsePagination } from "../services/pagination.service.js";
import { ProductStore } from "../services/product-store.js";

export const performanceRouter = Router();

// Resultado de medir una operación varias veces (todos los tiempos en milisegundos).
export type Measurement = {
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

// Iteraciones: las operaciones list y las de base de datos son más costosas,
// por eso tienen un tope propio menor que el general.
export const DEFAULT_ITERATIONS = 1000;
export const MAX_ITERATIONS = 10000;
export const LIST_ITERATIONS = 100;
export const DB_ITERATIONS = 20;

// Cantidad de productos con los que se siembra el ProductStore de prueba.
const SEED_PRODUCTS = 200;

// Valida ?iterations: entero positivo, por defecto 1000 y con tope de 10000.
export function parseIterations(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return DEFAULT_ITERATIONS;
  return Math.min(n, MAX_ITERATIONS);
}

const round = (value: number): number => Number(value.toFixed(4));

// Ejecuta una operación (sync o async) N veces midiendo cada llamada con performance.now().
// Si la operación lanza un error devuelve status "error" en vez de tumbar el endpoint.
export async function measure(
  service: string,
  operation: string,
  iterations: number,
  fn: (i: number) => unknown | Promise<unknown>
): Promise<Measurement> {
  let totalMs = 0;
  let minMs = Infinity;
  let maxMs = 0;

  try {
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn(i);
      const elapsed = performance.now() - start;
      totalMs += elapsed;
      minMs = Math.min(minMs, elapsed);
      maxMs = Math.max(maxMs, elapsed);
    }
    return {
      service,
      operation,
      status: "ok",
      iterations,
      totalMs: round(totalMs),
      avgMs: round(totalMs / iterations),
      minMs: round(minMs),
      maxMs: round(maxMs),
    };
  } catch (error) {
    return {
      service,
      operation,
      status: "error",
      iterations,
      totalMs: 0,
      avgMs: 0,
      minMs: 0,
      maxMs: 0,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Crea un ProductStore NUEVO (no toca los datos reales de la API) con productos de prueba.
function seededStore(count: number) {
  const store = new ProductStore();
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const p = store.create({
      name: `Producto ${i}`,
      sku: `SEED-${i}`,
      price: 1000 + i,
      stock: 100,
      category: i % 2 === 0 ? "tecnologia" : "hogar",
    });
    ids.push(p.id);
  }
  return { store, ids };
}

// GET /api/performance?iterations=N → mide cada servicio y devuelve los tiempos.
performanceRouter.get("/", async (req: Request, res: Response) => {
  const iterations = parseIterations(req.query.iterations);
  const listIterations = Math.min(iterations, LIST_ITERATIONS);
  const dbIterations = Math.min(iterations, DB_ITERATIONS);

  const data: Measurement[] = [];

  // --- pagination.service ---
  data.push(
    await measure("pagination.service", "parsePagination", iterations, () =>
      parsePagination({ page: 3, limit: 25 })
    )
  );

  // --- product-store (en memoria) ---
  const { store, ids } = seededStore(SEED_PRODUCTS);
  const createStore = new ProductStore();
  // Para medir remove se preparan antes (fuera del tiempo medido) tantos productos como iteraciones.
  const removeSetup = seededStore(iterations);

  data.push(
    await measure("product-store", "create", iterations, (i) =>
      createStore.create({ name: `Nuevo ${i}`, sku: `PERF-${i}`, price: 5000, stock: 10 })
    ),
    await measure("product-store", "getById", iterations, (i) =>
      store.getById(ids[i % ids.length])
    ),
    await measure("product-store", "getBySku", iterations, (i) =>
      store.getBySku(`SEED-${i % SEED_PRODUCTS}`)
    ),
    await measure("product-store", "list", listIterations, () => store.list()),
    await measure("product-store", "list (filtros)", listIterations, () =>
      store.list({ search: "producto 1", category: "tecnologia", active: true, minPrice: 1000, maxPrice: 1150 })
    ),
    await measure("product-store", "update", iterations, (i) =>
      store.update(ids[i % ids.length], { price: 2000 + i })
    ),
    await measure("product-store", "adjustStock", iterations, (i) =>
      store.adjustStock(ids[i % ids.length], 1)
    ),
    await measure("product-store", "remove", iterations, (i) =>
      removeSetup.store.remove(removeSetup.ids[i])
    )
  );

  // --- postgresql ---
  data.push(
    await measure("postgresql", "SELECT NOW()", dbIterations, () =>
      pgPool.query("SELECT NOW() AS now")
    ),
    await measure("postgresql", "SELECT users LIMIT 10", dbIterations, () =>
      pgPool.query("SELECT id, name, email, created_at FROM users ORDER BY id ASC LIMIT 10")
    )
  );

  // --- mongodb ---
  data.push(
    await measure("mongodb", "ping", dbIterations, () => getMongoDb().command({ ping: 1 })),
    await measure("mongodb", "find users limit 10", dbIterations, () =>
      getMongoDb().collection("users").find({}).limit(10).toArray()
    ),
    await measure("mongodb", "find products limit 10", dbIterations, () =>
      getMongoDb().collection("products").find({}).limit(10).toArray()
    )
  );

  // Tabla en consola para verla en los logs del contenedor (npm run docker:logs).
  console.table(
    data.map(({ service, operation, status, iterations: n, totalMs, avgMs, minMs, maxMs }) => ({
      service, operation, status, iterations: n, totalMs, avgMs, minMs, maxMs,
    }))
  );

  res.json({ iterations, unit: "ms", count: data.length, data });
});
