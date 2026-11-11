# Medición de rendimiento de los servicios

Fecha: 2026-11-11 · Rama: `practica-productos-sebastian-ruiz`

## Entorno

- Windows 11, Docker Desktop 29.5.2 (límite de memoria visible: 9.7 GiB)
- Stack levantado con `docker compose up --build -d`
- Servicios (ver `docker-compose.yml`):
  - **api**: Node 22 + Express 5 + TypeScript, puerto 3000
  - **postgres**: `postgres:16-alpine`, puerto 5432
  - **mongo**: `mongo:7`, puerto 27017
- Herramienta de carga: [autocannon](https://github.com/mcollina/autocannon), cliente en la misma máquina que los contenedores.
- Parámetros: **20 conexiones concurrentes, 10 s por endpoint** (10 conexiones para el POST).
- Resultado de todas las pruebas: **0 errores, 0 timeouts, 0 respuestas non-2xx**.

## 1. API: latencia y throughput

| Endpoint | Método | Req/s (prom.) | Lat. prom. (ms) | p50 (ms) | p99 (ms) | Máx (ms) | Total req |
|---|---|---:|---:|---:|---:|---:|---:|
| `/health` | GET | 2374.6 | 7.93 | 6 | 33 | 147 | 23743 |
| `/api/postgres/health` | GET | 1656.0 | 11.58 | 11 | 27 | 75 | 16560 |
| `/api/mongo/health` | GET | 1186.8 | 16.35 | 15 | 39 | 115 | 11868 |
| `/api/postgres/users` | GET | 1186.7 | 16.35 | 15 | 33 | 73 | 11867 |
| `/api/mongo/users` | GET | 1038.9 | 18.73 | 17 | 41 | 149 | 10389 |
| `/api/products` | GET | 1014.4 | 19.21 | 18 | 44 | 179 | 10144 |
| `/api/products` | POST | 1076.5 | 8.78 | 8 | 22 | 59 | 10765 |

## 2. Consumo de recursos bajo carga (`docker stats`)

CPU medio y máximo durante 10 s de carga. En Docker, 100 % equivale a un núcleo completo.

| Carga sobre | Servicio | CPU prom. | CPU máx. | Memoria |
|---|---|---:|---:|---:|
| `/api/postgres/users` | api | 65.8 % | 106.1 % | 74 MiB |
| | postgres | 26.9 % | 46.9 % | 52 MiB |
| | mongo | 18.4 % (*) | 63.9 % | 293 MiB |
| `/api/mongo/users` | api | 73.1 % | 127.6 % | 77 MiB |
| | postgres | 0.8 % | 4.3 % | 36 MiB |
| | mongo | 34.4 % | 78.5 % | 293 MiB |
| `/api/products` | api | 100.8 % | 157.4 % | 211 MiB |
| | postgres | 1.0 % | 3.8 % | 36 MiB |
| | mongo | 26.6 % | 69.6 % | 301 MiB |

(*) Mongo todavía estaba procesando las escrituras de la prueba POST anterior, por lo que ese valor no es atribuible a la carga sobre Postgres.

En reposo, después de las pruebas: api 0.45 % CPU / 69.5 MiB, postgres 0 % / 34.9 MiB, mongo 14.9 % / 292 MiB.

## 3. Tiempo de consulta directo en cada base

**PostgreSQL**: `EXPLAIN ANALYZE SELECT id,name,email,created_at FROM users ORDER BY id LIMIT 10;`

```
Limit  (actual time=0.014..0.016 rows=10 loops=1)
  -> Index Scan using users_pkey on users (actual time=0.013..0.014 rows=10 loops=1)
Planning Time: 0.760 ms
Execution Time: 0.055 ms
```

**MongoDB**: `db.users.find().limit(10).explain('executionStats')`

```
executionTimeMillis: 0
nReturned: 10
totalDocsExamined: 10
```

Ambas consultas están muy por debajo de 1 ms (con pocos datos, 21 filas en `users`), así que la latencia de la API la determina sobre todo Node/Express y la red, no la base.

## 4. Análisis

- **Referencia de la API**: `/health` no usa base de datos y sirve ~2 400 req/s con 7.9 ms de latencia. Es el techo de la API en este equipo.
- **Postgres vs Mongo**: en las rutas de health, Postgres es más rápido (1656 contra 1187 req/s). En el listado de usuarios la diferencia es menor (1187 contra 1039 req/s). Ambas cumplen con latencias p99 inferiores a 45 ms.
- **`GET /api/products`** es el endpoint más lento y el que más recursos consume (CPU de la API ~100 % y memoria de 211 MiB). Esto se debe a que ejecuta `find({}).toArray()` **sin límite ni paginación**, y en la colección había ~10 800 productos (parte creados por la prueba POST). Cada petición serializa toda la colección. Mejora recomendada: paginar con `parsePagination` como ya hacen las rutas de usuarios.
- **POST `/api/products`** tiene buena latencia (8.8 ms) porque `insertOne` es barato.
- **Cuello de botella**: en todas las pruebas la CPU de la **api** (un solo proceso Node) es el recurso más exigido, por delante de las bases de datos.
- **Limitaciones**: cliente de carga y servicios comparten la misma máquina, y los datos de prueba son pocos. Los números sirven para comparar servicios entre sí, no como valores absolutos de producción.

## 5. Trazabilidad: endpoint `GET /api/performance`

Para medir el tiempo de ejecución de cada servicio desde el propio proyecto, se agregó:

| Archivo | Cambio |
|---|---|
| `src/routes/performance.routes.ts` | **Nuevo.** Router `performanceRouter` con `GET /`. |
| `src/app.ts` | Se registró `app.use("/api/performance", performanceRouter)`. |
| `tests/performance.test.ts` | **Nuevo.** 8 tests (validación de `?iterations`, función `measure` y forma de la respuesta). |
| `RENDIMIENTO.md` | Esta sección. |

### Cómo funciona

- Cada operación se ejecuta N veces y **cada llamada se cronometra** con `performance.now()` (`node:perf_hooks`).
- `totalMs`: suma de todas las llamadas · `avgMs`: promedio (`totalMs / iterations`) · `minMs`: la llamada más rápida · `maxMs`: la más lenta (suele ser la primera, por calentamiento, o un pico del recolector de basura/red).
- `?iterations=N`: entero positivo, **por defecto 1000, tope 10000**. Un valor inválido (`abc`, `-5`, `0`) vuelve a 1000. Las operaciones costosas tienen su propio tope: `list` hasta **100** iteraciones y las consultas a base de datos hasta **20**.
- `ProductStore` se mide con una **instancia nueva** (sembrada con 200 productos), así que no toca los datos reales de la API.
- Si una operación falla (por ejemplo una base caída), esa fila sale con `status: "error"` y `message`, y el endpoint sigue respondiendo.
- El resultado se devuelve en JSON (`{ iterations, unit: "ms", count, data }`) y también se imprime con `console.table` en los logs del contenedor (`npm run docker:logs`).

### Resultados con `?iterations=1000` (Docker, mismo equipo de la sección 1)

| Servicio | Operación | Iter. | totalMs | avgMs | minMs | maxMs |
|---|---|---:|---:|---:|---:|---:|
| pagination.service | parsePagination | 1000 | 0.4318 | 0.0004 | 0.0002 | 0.1236 |
| product-store | create | 1000 | 6.5985 | 0.0066 | 0.0015 | 1.5606 |
| product-store | getById | 1000 | 0.4648 | 0.0005 | 0.0003 | 0.0926 |
| product-store | getBySku | 1000 | 1.5218 | 0.0015 | 0.0005 | 0.1931 |
| product-store | list | 100 | 13.9741 | 0.1397 | 0.0581 | 5.6801 |
| product-store | list (filtros) | 100 | 3.2980 | 0.0330 | 0.0223 | 0.6937 |
| product-store | update | 1000 | 1.6491 | 0.0016 | 0.0007 | 0.1382 |
| product-store | adjustStock | 1000 | 1.8572 | 0.0019 | 0.0007 | 0.5771 |
| product-store | remove | 1000 | 1.0809 | 0.0011 | 0.0002 | 0.3695 |
| postgresql | SELECT NOW() | 20 | 16.9276 | 0.8464 | 0.3253 | 2.9003 |
| postgresql | SELECT users LIMIT 10 | 20 | 11.1654 | 0.5583 | 0.3640 | 2.1058 |
| mongodb | ping | 20 | 14.6453 | 0.7323 | 0.4740 | 2.5895 |
| mongodb | find users limit 10 | 20 | 20.3377 | 1.0169 | 0.6575 | 1.9388 |
| mongodb | find products limit 10 | 20 | 22.7881 | 1.1394 | 0.7545 | 1.8666 |

Se repitió con `?iterations=200` (tiempos del mismo orden) y con `?iterations=10000`, donde la única operación que cambia de forma notable es `create` (promedio 0.0665 ms, ver análisis).

### Análisis

- **Memoria vs. base de datos**: las operaciones en memoria cuestan microsegundos (0.0002 a 0.003 ms), mientras que cualquier consulta a una base de datos cuesta entre 0.5 y 1.1 ms. Es decir, una consulta a base de datos es **100 a 1000 veces más lenta** que una operación en memoria, porque implica ir por la red entre contenedores, serializar y esperar la respuesta del servidor.
- **`getById` frente a `list`**: `getById` es una búsqueda directa en un `Map` (O(1), ~0.0005 ms). `list` recorre los 200 productos, filtra, **ordena con `Intl.Collator`** y **copia cada producto** (~0.14 ms), unas 280 veces más lento. `list (filtros)` es más barata (0.033 ms) porque los filtros descartan casi todo antes de ordenar y copiar.
- **`getBySku`** (0.0015 ms) es más lento que `getById` porque recorre el `Map` buscando el SKU (O(n)). Se nota con muchos datos: con 10000 iteraciones, `create` sube de 0.0066 ms a 0.0665 ms de promedio (10 veces más) porque cada alta revisa si el SKU ya existe recorriendo todo el almacén, que crece hasta 10000 productos.
- **Postgres vs. Mongo**: Postgres es algo más rápido (`SELECT users` 0.56 ms) que Mongo (`find users` 1.02 ms). Esto coincide con la medición de carga de la sección 1.
- **`SELECT NOW()` / `ping`**: miden casi solo la latencia de ida y vuelta (~0.7 a 0.85 ms), sin trabajo de datos. Como la consulta real (`SELECT users`) tarda menos que `SELECT NOW()` en esta corrida, buena parte del tiempo es ruido de red y de arranque de conexión.
- **Variabilidad**: el `maxMs` es varias veces el promedio en casi todas las filas (por ejemplo `list` 5.68 ms frente a 0.14 ms). Son picos aislados al inicio por calentamiento del JIT y el recolector de basura; por eso el `avgMs` y el `minMs` son más representativos.
- **Limitaciones**: 20 iteraciones en base de datos es una muestra pequeña y los tiempos varían entre ejecuciones (en la prueba de 200 iteraciones, `SELECT NOW()` dio 0.86 ms y 0.44 ms en dos corridas). Sirven para comparar el orden de magnitud entre servicios, no como valores exactos.

## 6. Cómo reproducirlo

```powershell
docker compose up --build -d
npx autocannon -c 20 -d 10 http://localhost:3000/health
npx autocannon -c 20 -d 10 http://localhost:3000/api/postgres/users
npx autocannon -c 20 -d 10 http://localhost:3000/api/mongo/users
npx autocannon -c 20 -d 10 http://localhost:3000/api/products
docker stats          # en otra terminal mientras corre la carga
curl.exe "http://localhost:3000/api/performance?iterations=1000"   # o abrir la URL en el navegador
docker compose logs -f api                                        # tabla console.table de la medición
docker compose down
```
