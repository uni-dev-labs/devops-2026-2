# Carga por endpoint (`despues`)

1000 peticiones por endpoint, concurrencia 10, 30 de calentamiento · 2026-11-12T04:34:45.037Z

| Endpoint | avg ms | p50 | p95 | p99 | máx | req/s | errores |
|---|---:|---:|---:|---:|---:|---:|---:|
| GET /health | 4.68 | 3.84 | 8.79 | 14.32 | 21.43 | 2119 | 0 |
| GET /api/postgres/health | 5.83 | 5.23 | 9.69 | 15.46 | 29.52 | 1707 | 0 |
| GET /api/postgres/users | 5.59 | 5.21 | 8.78 | 10.96 | 14.9 | 1778 | 0 |
| POST /api/postgres/users | 6.25 | 5.79 | 10.76 | 13.92 | 18.4 | 1595 | 0 |
| GET /api/mongo/health | 6.31 | 5.82 | 9.55 | 13.23 | 20.04 | 1578 | 0 |
| GET /api/mongo/users | 6.98 | 6.37 | 10.91 | 15.5 | 21.01 | 1428 | 0 |
| POST /api/mongo/users | 6.98 | 6.6 | 11.07 | 15.75 | 20.69 | 1426 | 0 |
| GET /api/products | 5.81 | 5.38 | 8.86 | 11.28 | 15.84 | 1714 | 0 |
| POST /api/products | 5.97 | 5.55 | 8.76 | 13.94 | 17.56 | 1666 | 0 |

## Desglose del servidor (Server-Timing, promedio en ms)

| Endpoint | Tramos |
|---|---|
| GET /health | total 0.12 |
| GET /api/postgres/health | pg.ping 1.99 · total 2.1 |
| GET /api/postgres/users | pagination.parse 0.01 · pg.selectUsers 1.78 · total 1.92 |
| POST /api/postgres/users | pg.insertUser 2.94 · total 3.16 |
| GET /api/mongo/health | mongo.ping 2.11 · total 2.2 |
| GET /api/mongo/users | pagination.parse 0.01 · mongo.findUsers 2.34 · total 2.45 |
| POST /api/mongo/users | mongo.insertUser 2.37 · total 2.56 |
| GET /api/products | mongo.findProducts 1.93 · total 2.01 |
| POST /api/products | mongo.insertProduct 2.01 · total 2.17 |

## Recursos (pico de docker stats durante la carga)

| Contenedor | CPU pico | Memoria pico | Muestras |
|---|---:|---:|---:|
| devops-api | 127.33% | 81.66 MiB | 3 |
| devops-postgres | 8.59% | 50.52 MiB | 3 |
| devops-mongo | 76.72% | 76.8 MiB | 3 |
