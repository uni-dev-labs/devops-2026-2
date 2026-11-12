# Trazabilidad y rendimiento de los servicios

**Autor:** Sebastián Ayala · **Rama:** `trazabilidad-ayalagarcia` · **Fecha:** 11-nov-2026

## Resumen

1. **Instrumenté la API** para que cada petición sea trazable. Cada respuesta lleva un `X-Trace-Id`, un header `Server-Timing` con el desglose por tramo (spans) y una línea de log JSON. Además, `GET /api/traces` permite consultar las trazas.
2. **Medí cada servicio** en dos niveles:
   - micro: benchmarks de `ProductStore` y `parsePagination` con Vitest, con 100, 1.000 y 10.000 productos;
   - macro: 1.000 peticiones por endpoint contra el stack real en Docker (API + PostgreSQL + MongoDB).
3. **Con esas mediciones encontré y corregí 3 cuellos de botella** y lo verifiqué con mediciones de antes y después:

| Hallazgo | Dónde | Antes | Después | Mejora |
|---|---|---:|---:|---:|
| `localeCompare` crea un `Intl.Collator` en cada comparación del sort | `ProductStore.list()` con 10k productos | 353 ms | 8.3 ms | **43×** |
| Búsqueda de sku recorriendo todo el almacén, O(n) | `getBySku` / `create` / `update` con 10k | 65 µs / 46 µs / 30 µs | 0.18 / 1.3 / 0.5 µs | **365× / 35× / 57×** |
| `CREATE TABLE IF NOT EXISTS` en **cada** petición | `GET /api/postgres/users` | 1.249 req/s · p95 12.3 ms | 1.778 req/s · p95 8.8 ms | **+42 % throughput** |

Además encontré un cuarto problema que dejo documentado pero sin cambiar, porque cambiaría el contrato de la API: `GET /api/products` no pagina (ver [Hallazgo 4](#hallazgo-4-get-apiproducts-sin-paginación)).

Los 32 tests de la práctica de productos siguen pasando (nota 5.0). Los tests generales pasaron de 8 a **36**, con 28 nuevos para la trazabilidad y para el índice de sku.

---

## 1. Qué se instrumentó

```
Cliente ──X-Trace-Id──▶ traceMiddleware ──▶ ruta ──withSpan──▶ Postgres / Mongo
                             │                                     │
                             ◀──────────── spans (AsyncLocalStorage)
                             │
             ┌───────────────┼──────────────────┐
     X-Trace-Id +      log JSON por        TraceStore → GET /api/traces
     Server-Timing     petición            (/stats: p50/p95 por ruta)
```

| Span | Mide |
|---|---|
| `pagination.parse` | `parsePagination(req.query)` |
| `pg.ping`, `pg.ensureUsersTable`, `pg.selectUsers`, `pg.insertUser` | Cada consulta a PostgreSQL |
| `mongo.ping`, `mongo.findUsers`, `mongo.insertUser`, `mongo.findProducts`, `mongo.insertProduct` | Cada operación en MongoDB |
| `total` | La petición completa dentro del servidor |
| `startup` (log) | Arranque de la API: `connectPostgres`, `connectMongo` y tiempo hasta escuchar |

Ejemplo real de una respuesta:

```
HTTP/1.1 200 OK
X-Trace-Id: da02b196-9f31-4cf7-94f8-eef245ade9a5
Server-Timing: s0;dur=0.109;desc="pagination.parse", s1;dur=28.449;desc="pg.ensureUsersTable", s2;dur=3.729;desc="pg.selectUsers", total;dur=34.79
```

Decisiones de diseño:

- **`AsyncLocalStorage`**: el span sabe a qué petición pertenece sin pasar el id por parámetros. Hay un test que comprueba que dos peticiones concurrentes no mezclan sus spans.
- **Propagación del id**: si llega un `X-Trace-Id` válido se reutiliza, así se puede seguir una operación entre servicios. Si no es válido, por ejemplo `<script>`, se genera un UUID.
- **`Server-Timing`** es un header estándar del W3C, y el navegador lo muestra en DevTools sin instalar nada.
- **Costo casi nulo**: `GET /health`, que solo pasa por el middleware, tarda **0.11 ms** dentro del servidor.

Detalles y uso: [src/observability/README.md](src/observability/README.md).

---

## 2. Entorno y metodología

| | |
|---|---|
| Máquina | AMD Ryzen 7 5800X (8 núcleos), 16 GB RAM, Windows 11 |
| Runtime | Node v24.21.0 (benchmarks) · `node:22-alpine` (API en Docker) · Docker 29.8.1 |
| Bases de datos | `postgres:16-alpine`, `mongo:7` (docker compose del repo) |
| Micro | Vitest 5 `bench.compare`, 100 ms de calentamiento + 400 ms por caso, datos deterministas |
| Macro | `scripts/medir-endpoints.mjs`: 30 peticiones de calentamiento + 1.000 medidas por endpoint, concurrencia 10 |

Para que el antes y el después fueran comparables:

- Las **bases de datos se reiniciaron** antes de cada corrida (`docker compose down -v`), así ambas corridas parten de los mismos datos.
- En el benchmark de escrituras se mide **`create + remove`** y no solo `create`. Si solo se creara, el almacén crecería durante la medición y el resultado no correspondería al tamaño declarado. Lo noté porque en la primera corrida `create` con "100 productos" tardaba igual que con 10.000.
- Las corridas "antes" y "después" se hicieron en la misma máquina y la misma sesión. Los datos crudos están versionados en `reports/`.

---

## 3. Micro: servicios en memoria

### Antes de optimizar: cómo escalaba cada operación

| Operación | 100 productos | 1.000 | 10.000 | Crecimiento |
|---|---:|---:|---:|---|
| `getById` | 0.17 µs | 0.19 µs | 0.19 µs | O(1) (`Map`) ✅ |
| `adjustStock(+1)` | 0.28 µs | 0.30 µs | 0.36 µs | O(1) ✅ |
| `getBySku` | 0.70 µs | 6.3 µs | **64.7 µs** | O(n) ❌ |
| `update({ price })` | 0.63 µs | 3.1 µs | **29.9 µs** | O(n) ❌ (revalida el sku aunque no cambie) |
| `create + remove` | 1.7 µs | 5.5 µs | **46.0 µs** | O(n) ❌ |
| `list()` sin filtros | 2.2 ms | 32.4 ms | **353 ms** | O(n log n) con una constante enorme ❌ |
| `list({ search })` | 51 µs | 1.3 ms | 10.1 ms | |
| `parsePagination` | 0.06 – 0.13 µs | | | despreciable ✅ |

`list()` con 10.000 productos tardaba **un tercio de segundo**, y como es síncrono bloquea el event loop de Node todo ese tiempo.

### Hallazgo 1: `localeCompare` dentro del sort

```ts
// antes
.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
```

Cuando se le pasan `locales` u `options`, `localeCompare` crea un `Intl.Collator` nuevo en cada llamada. Ordenar 10.000 elementos hace unas 130.000 comparaciones, o sea unos 130.000 collators. La solución fue crear el collator una sola vez:

```ts
const NAME_COLLATOR = new Intl.Collator("es", { sensitivity: "base" });
.sort((a, b) => NAME_COLLATOR.compare(a.name, b.name) || ...)
```

El orden es idéntico, y lo comprueba un test con tildes, ñ, mayúsculas y empates. De paso, los 5 `.filter()` encadenados, que creaban 5 arreglos intermedios, quedaron en un solo recorrido.

### Hallazgo 2: búsqueda lineal por sku

`findBySku` recorría todo el `Map` y se llamaba desde `getBySku`, `create` y `update`. Lo reemplacé por un índice `Map<sku, id>` que se mantiene en `create`, `update` (cuando cambia el sku) y `remove`. Para el índice agregué 4 tests: cambio de sku, reutilizar un sku después de borrar, un update inválido que no debe tocar el índice, y el orden.

### Resultado: antes vs después

| Operación (10.000 productos) | Antes | Después | Mejora |
|---|---:|---:|---:|
| `getBySku` | 64.66 µs | 0.177 µs | **365×** |
| `update({ price })` | 29.86 µs | 0.526 µs | **57×** |
| `update({ sku })` | 28.96 µs | 0.613 µs | **47×** |
| `list()` sin filtros | 353.17 ms | 8.28 ms | **43×** |
| `create + remove` | 46.03 µs | 1.33 µs | **35×** |
| `list({ category, minPrice, maxPrice })` | 18.38 ms | 0.55 ms | **34×** |
| `list({ search })` | 10.14 ms | 0.57 ms | **18×** |
| `getById` / `adjustStock` | 0.19 / 0.36 µs | 0.19 / 0.37 µs | igual (ya eran O(1)) |

Ahora `create`, `update` y `getBySku` tardan prácticamente lo mismo con 100 que con 10.000 productos. La tabla completa con los tres tamaños está en [reports/bench/comparacion.md](reports/bench/comparacion.md).

---

## 4. Macro: endpoints contra Docker

### Hallazgo 3: la trazabilidad muestra un CREATE TABLE en cada petición

El desglose de `Server-Timing` en la corrida "antes" mostró esto:

| Endpoint | Tramos en el servidor (promedio) |
|---|---|
| `GET /api/postgres/users` | `pagination.parse` 0.01 · **`pg.ensureUsersTable` 2.08** · `pg.selectUsers` 2.13 · total 4.34 ms |
| `POST /api/postgres/users` | **`pg.ensureUsersTable` 1.73** · `pg.insertUser` 2.49 · total 4.42 ms |

**El 48 % del tiempo de servidor** de `GET /users` se iba en un `CREATE TABLE IF NOT EXISTS` que no hace nada después de la primera vez. Sin el desglose por span esto no se ve: el endpoint "tarda 8 ms" y ya.

La solución fue ejecutarlo **una vez por proceso**, guardando la promesa. Si falla, se olvida la promesa y se reintenta en la siguiente petición, así la API no queda rota si Postgres arranca tarde. Hay un test que cubre ese reintento.

### Resultado: latencia vista por el cliente (1.000 peticiones, concurrencia 10)

| Endpoint | avg antes | avg después | p95 antes | p95 después | req/s antes | req/s después |
|---|---:|---:|---:|---:|---:|---:|
| **GET /api/postgres/users** | 7.98 ms | **5.59 ms** | 12.25 ms | **8.78 ms** | 1.249 | **1.778 (+42 %)** |
| **POST /api/postgres/users** | 7.41 ms | **6.25 ms** | 12.17 ms | **10.76 ms** | 1.343 | **1.595 (+19 %)** |
| GET /health | 4.71 | 4.68 | 8.76 | 8.79 | 2.105 | 2.119 |
| GET /api/postgres/health | 5.72 | 5.83 | 9.01 | 9.69 | 1.740 | 1.707 |
| GET /api/mongo/health | 6.55 | 6.31 | 10.19 | 9.55 | 1.517 | 1.578 |
| GET /api/mongo/users | 6.56 | 6.98 | 9.96 | 10.91 | 1.518 | 1.428 |
| POST /api/mongo/users | 7.08 | 6.98 | 10.83 | 11.07 | 1.406 | 1.426 |
| GET /api/products | 5.87 | 5.81 | 8.81 | 8.86 | 1.696 | 1.714 |
| POST /api/products | 5.87 | 5.97 | 8.22 | 8.76 | 1.697 | 1.666 |

0 errores en las 18.000 peticiones medidas. Los endpoints que no cambié se movieron menos de ±7 %, que es el ruido normal entre corridas. Eso confirma que la mejora de los dos endpoints de Postgres sí viene del cambio.

Tiempo de servidor de `GET /api/postgres/users`: **4.34 → 1.92 ms (2.3×)**.

### Dónde se va el tiempo ahora (después)

| Endpoint | Tramos en el servidor | Total en el servidor | Latencia del cliente |
|---|---|---:|---:|
| GET /health | (solo middleware) | 0.12 ms | 4.68 ms |
| GET /api/postgres/users | `pg.selectUsers` 1.78 | 1.92 ms | 5.59 ms |
| POST /api/postgres/users | `pg.insertUser` 2.94 | 3.16 ms | 6.25 ms |
| GET /api/mongo/users | `mongo.findUsers` 2.34 | 2.45 ms | 6.98 ms |
| POST /api/mongo/users | `mongo.insertUser` 2.37 | 2.56 ms | 6.98 ms |
| GET /api/products | `mongo.findProducts` 1.93 | 2.01 ms | 5.81 ms |

Lectura: ahora casi todo el tiempo del servidor es la consulta a la base de datos, y el código propio de la API cuesta menos de 0.2 ms. Los ~4.5 ms restantes que ve el cliente, que también aparecen en `/health`, son red de Docker Desktop en Windows (WSL2) y la cola de 10 peticiones concurrentes. Eso no se arregla en el código.

### Recursos (pico de `docker stats` durante la carga)

| Contenedor | CPU pico | Memoria pico |
|---|---:|---:|
| devops-api | 127 % (≈1,3 núcleos) | 82 MiB |
| devops-mongo | 77 % | 77 MiB |
| devops-postgres | 9 % (antes 28 %) | 51 MiB |

La CPU pico de Postgres bajó de 28 % a 9 % porque dejó de recibir un `CREATE TABLE` por petición. La API es el contenedor que más CPU usa: con concurrencia 10 el cuello está en el proceso de Node (un solo hilo para JS) y no en las bases de datos.

### Arranque

```json
{"level":"info","msg":"startup","readyMs":281.006,"phasesMs":{"connectPostgres":21.368,"connectMongo":21.759}}
```

La API queda lista en **unos 280 ms**: unos 21 ms conectándose a cada base de datos y el resto cargando módulos.

### Hallazgo 4: `GET /api/products` sin paginación

En una corrida intermedia, sin reiniciar las bases de datos, la colección `products` ya tenía **2.060 documentos** de corridas anteriores. Con eso `GET /api/products` pasó de 5.9 ms a **54.6 ms** de promedio (182 req/s en lugar de unos 1.700), porque devuelve *todos* los productos en cada petición. El costo crece linealmente con la colección.

**Recomendación:** usar `parsePagination` como en `/users` (`?page=&limit=`, máximo 50). No lo cambié en esta entrega porque cambia la respuesta de un endpoint que ya existe, y conviene acordarlo antes.

---

## 5. Trazabilidad en CI

Agregué el job **"Rendimiento de servicios"** en `.github/workflows/ci.yml`. En cada PR:

1. corre `npm run bench`;
2. publica la tabla comparada contra la línea base versionada (`reports/bench/antes`) en el **resumen del run** de GitHub Actions;
3. sube los JSON como artifact `bench-<sha del commit>`.

Así cada commit queda ligado a sus tiempos: **commit → run → artifact con los resultados**. Una advertencia: el runner de GitHub es más lento que mi máquina, así que en CI sirve más mirar la tendencia (por ejemplo que `list()` siga siendo O(n log n)) que los valores absolutos.

---

## 6. Cómo reproducirlo

```bash
npm ci
npm test                         # 36 tests (incluye trazabilidad)
npm run test:productos           # 32/32 práctica productos

# Micro
BENCH_LABEL=despues npm run bench
npm run bench:report             # compara reports/bench/antes vs despues

# Macro (si el 5432 está ocupado, en .env: POSTGRES_PORT=55432)
docker compose down -v && npm run docker:up
npm run perf:endpoints -- --requests 1000 --concurrency 10 --label despues
curl http://localhost:3000/api/traces/stats
```

## 7. Archivos de esta entrega

| Archivo | |
|---|---|
| `src/observability/*` | Trazabilidad: contexto, `withSpan`, middleware, store, rutas `/api/traces`, README |
| `src/routes/*.routes.ts` | Spans en cada consulta y `ensureUsersTable` una sola vez |
| `src/services/product-store.ts` | `Intl.Collator` reutilizado, índice por sku, filtro en un solo recorrido |
| `src/index.ts` | Medición del arranque |
| `bench/*.bench.ts`, `bench/report.ts` | Benchmarks con Vitest 5 |
| `scripts/medir-endpoints.mjs` | Carga HTTP + desglose Server-Timing + `docker stats` |
| `scripts/bench-report.mjs` | Tabla de comparación entre corridas |
| `tests/observability/*`, `tests/product-store.sku-index.test.ts` | 28 tests nuevos |
| `reports/` | Datos crudos (JSON) y tablas de antes y después |
| `.github/workflows/ci.yml` | Job de rendimiento |
