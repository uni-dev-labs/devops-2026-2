import type { AddressInfo } from "node:net";
import { createApp } from "../app.js";
import { pgPool } from "../db/postgres.js";
import { getMongoDb } from "../db/mongo.js";
import { createBench, ITERATIONS, type BenchResult } from "../bench-utils.js";

// Levanta la app en un puerto libre y mide peticiones HTTP reales a cada ruta.
// Las rutas con DB requieren que benchDb() (o connectPostgres/connectMongo) ya se haya ejecutado.
export async function benchRoutes(): Promise<BenchResult> {
  const { measure, section, result } = createBench("routes");
  const server = createApp().listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const tag = `bench-${Date.now()}`;

  const request = async (path: string, init?: RequestInit) => {
    const res = await fetch(base + path, init);
    await res.text();
    if (res.status >= 500) throw new Error(`${path} respondió ${res.status}`);
    return res.status;
  };
  const get = (path: string) => request(path);
  const post = (path: string, body: unknown) =>
    request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  try {
    await measure("GET /health", ITERATIONS, () => get("/health"));
    await measure("GET /ruta-inexistente (404)", ITERATIONS, () => get("/nope"));

    await section("postgres", async () => {
      await measure("GET /api/postgres/health", ITERATIONS, () => get("/api/postgres/health"));
      await measure("GET /api/postgres/users", ITERATIONS, () => get("/api/postgres/users?page=1&limit=10"));
      await measure("POST /api/postgres/users", ITERATIONS, (i) =>
        post("/api/postgres/users", { name: "Bench", email: `${tag}-r${i}@bench.test` }),
      );
    });
    await section("mongo", async () => {
      await measure("GET /api/mongo/health", ITERATIONS, () => get("/api/mongo/health"));
      await measure("GET /api/mongo/users", ITERATIONS, () => get("/api/mongo/users?page=1&limit=10"));
      await measure("POST /api/mongo/users", ITERATIONS, (i) =>
        post("/api/mongo/users", { name: "Bench", email: `${tag}-r${i}@bench.test` }),
      );
    });
    await section("products", async () => {
      await measure("GET /api/products", ITERATIONS, () => get("/api/products"));
      await measure("POST /api/products", ITERATIONS, (i) => post("/api/products", { name: `${tag}-p${i}`, price: 10 }));
    });
  } finally {
    await new Promise((r) => server.close(r));
  }

  await section("limpieza-postgres", async () => {
    await pgPool.query("DELETE FROM users WHERE email LIKE $1", [`${tag}-%`]);
  });
  await section("limpieza-mongo", async () => {
    const db = getMongoDb();
    await db.collection("users").deleteMany({ email: { $regex: `^${tag}-` } });
    await db.collection("products").deleteMany({ name: { $regex: `^${tag}-` } });
  });

  return result;
}
