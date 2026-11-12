# Carga por endpoint (`antes`)

1000 peticiones por endpoint, concurrencia 10, 30 de calentamiento · 2026-11-12T04:33:58.075Z

| Endpoint | avg ms | p50 | p95 | p99 | máx | req/s | errores |
|---|---:|---:|---:|---:|---:|---:|---:|
| GET /health | 4.39 | 3.44 | 8.21 | 15.91 | 21.85 | 2259 | 0 |
| GET /api/postgres/health | 5.72 | 5.2 | 9.01 | 15.66 | 26.83 | 1740 | 0 |
| GET /api/postgres/users | 7.98 | 7.58 | 12.25 | 14.62 | 15.98 | 1249 | 0 |
| POST /api/postgres/users | 7.41 | 7.05 | 12.17 | 16.61 | 21.45 | 1343 | 0 |
| GET /api/mongo/health | 6.55 | 5.93 | 10.19 | 19.17 | 25.54 | 1517 | 0 |
| GET /api/mongo/users | 6.56 | 6 | 9.96 | 16.74 | 23.21 | 1518 | 0 |
| POST /api/mongo/users | 7.08 | 6.69 | 10.83 | 15.86 | 21.2 | 1406 | 0 |
| GET /api/products | 5.87 | 5.55 | 8.81 | 11.47 | 15.93 | 1696 | 0 |
| POST /api/products | 5.87 | 5.47 | 8.22 | 14.39 | 21.06 | 1697 | 0 |

## Desglose del servidor (Server-Timing, promedio en ms)

| Endpoint | Tramos |
|---|---|
| GET /health | total 0.11 |
| GET /api/postgres/health | pg.ping 1.92 · total 2.03 |
| GET /api/postgres/users | pagination.parse 0.01 · pg.ensureUsersTable 2.08 · pg.selectUsers 2.13 · total 4.34 |
| POST /api/postgres/users | pg.ensureUsersTable 1.73 · pg.insertUser 2.49 · total 4.42 |
| GET /api/mongo/health | mongo.ping 2.22 · total 2.32 |
| GET /api/mongo/users | pagination.parse 0.01 · mongo.findUsers 2.23 · total 2.32 |
| POST /api/mongo/users | mongo.insertUser 2.4 · total 2.58 |
| GET /api/products | mongo.findProducts 2.05 · total 2.14 |
| POST /api/products | mongo.insertProduct 1.99 · total 2.15 |

## Recursos (pico de docker stats durante la carga)

| Contenedor | CPU pico | Memoria pico | Muestras |
|---|---:|---:|---:|
| devops-api | 138.76% | 78.47 MiB | 3 |
| devops-postgres | 28.25% | 51.43 MiB | 3 |
| devops-mongo | 19.82% | 77.24 MiB | 3 |
