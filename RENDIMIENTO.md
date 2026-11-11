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

## 5. Cómo reproducirlo

```powershell
docker compose up --build -d
npx autocannon -c 20 -d 10 http://localhost:3000/health
npx autocannon -c 20 -d 10 http://localhost:3000/api/postgres/users
npx autocannon -c 20 -d 10 http://localhost:3000/api/mongo/users
npx autocannon -c 20 -d 10 http://localhost:3000/api/products
docker stats          # en otra terminal mientras corre la carga
docker compose down
```
