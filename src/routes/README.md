# Medición de rendimiento de los servicios

Este documento explica cómo se midió cuánto tarda en ejecutarse cada servicio del proyecto y presenta los resultados obtenidos.

**Autor:** Juan Pablo Barrera · **Rama:** `practica-productos-barrera`

## Qué se agregó

| Archivo | Cambio |
|---|---|
| `src/routes/performance.routes.ts` | Nuevo. Define el endpoint `GET /api/performance` que mide los servicios. |
| `src/app.ts` | Registra la ruta con `app.use("/api/performance", performanceRouter)`. |


## Cómo funciona

El endpoint ejecuta cada operación varias veces seguidas y toma el tiempo de cada ejecución con `performance.now()` (de `node:perf_hooks`, precisión de microsegundos). Con esos tiempos calcula:

- **avgMs:** promedio por ejecución.
- **minMs / maxMs:** la ejecución más rápida y la más lenta.
- **totalMs:** suma de todas las ejecuciones.

Servicios medidos:

| Servicio | Operaciones | Iteraciones |
|---|---|---|
| `pagination.service` | `parsePagination` | `iterations` |
| `product-store` (en memoria) | `create`, `getById`, `getBySku`, `update`, `adjustStock`, `remove` | `iterations` |
| `product-store` (en memoria) | `list`, `list (filtros)` | máximo 100 |
| PostgreSQL | `SELECT NOW()`, `SELECT users` | 20 |
| MongoDB | `ping`, `find users`, `find products` | 20 |

Detalles de la medición:

- Las lecturas de `product-store` se miden sobre un almacén precargado con tantos productos como `iterations` (1000 en esta corrida).
- `list` se limita a 100 iteraciones porque ordena todo el almacén en cada llamada.
- Las bases de datos usan 20 iteraciones porque cada consulta viaja por la red hasta el contenedor.
- Si un servicio falla (por ejemplo, una base de datos apagada), su fila sale con `status: "error"` y el mensaje, sin detener el resto de la medición.
- Además de responder en JSON, el endpoint imprime una tabla con `console.table` en los logs del servidor.

## Cómo ejecutarlo

1. Levantar las bases de datos y la API con Docker:

   ```bash
   npm run docker:up
   ```

2. Abrir en el navegador (el parámetro `iterations` es opcional, por defecto 1000 y máximo 10000):

   ```
   http://localhost:3000/api/performance?iterations=1000
   ```

3. Ver la tabla de resultados en los logs de la API:

   ```bash
   npm run docker:logs
   ```

## Resultados

Los siguientes comandos sirven para ver los resultados del endpoint `/api/performance`, es decir, cuánto tarda cada servicio. Se ejecutan desde la raíz del proyecto, con los contenedores ya levantados (`npm run docker:up`).

Ver los resultados en JSON con la medición por defecto (1000 iteraciones):

```bash
curl "http://localhost:3000/api/performance"
```

Ver los resultados con otra cantidad de iteraciones (máximo 10000):

```bash
curl "http://localhost:3000/api/performance?iterations=5000"
```

En PowerShell, ver los resultados como tabla:

```powershell
(Invoke-RestMethod "http://localhost:3000/api/performance?iterations=1000").data | Format-Table service, operation, status, iterations, avgMs, minMs, maxMs, totalMs
```

Ver la tabla que imprime el servidor en sus logs cada vez que se llama el endpoint:

```bash
npm run docker:logs
```

Cada fila del resultado indica el servicio, la operación, si funcionó (`status`), cuántas veces se ejecutó y los tiempos en milisegundos (`avgMs`, `minMs`, `maxMs`, `totalMs`).
