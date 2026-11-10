/**
 * Corre los benchmarks de cada carpeta y muestra una tabla:
 *   src/services/services.benchmark.ts
 *   src/db/db.benchmark.ts
 *   src/routes/routes.benchmark.ts
 * Uso: npm run benchmark   (ITERATIONS=500 SERVICE_ITERATIONS=5000 para cambiar repeticiones)
 */
import { printReport } from "../src/bench-utils.js";
import { benchServices } from "../src/services/services.benchmark.js";
import { benchDb } from "../src/db/db.benchmark.js";
import { benchRoutes } from "../src/routes/routes.benchmark.js";
import { closePostgres } from "../src/db/postgres.js";
import { closeMongo } from "../src/db/mongo.js";

const services = await benchServices();
const db = await benchDb();
const routes = await benchRoutes();

printReport([services, db, routes]);
await Promise.allSettled([closePostgres(), closeMongo()]);
