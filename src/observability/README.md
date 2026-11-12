# Trazabilidad de peticiones (`src/observability`)

Cada petición HTTP recibe un **traceId** y se divide en **spans**, que son los tramos medidos: consulta a Postgres, consulta a Mongo, paginación. Así se puede saber **dónde** se va el tiempo de cada petición, y no solo cuánto tarda.

```
GET /api/postgres/users  ──────────────────────── total 4.34 ms
 ├─ pagination.parse     ▏ 0.01 ms
 ├─ pg.ensureUsersTable  ████████████ 2.08 ms   ← hallazgo: corría en cada petición
 └─ pg.selectUsers       ████████████ 2.13 ms
```

## Archivos

| Archivo | Qué hace |
|---|---|
| `trace-context.ts` | Guarda la traza activa con `AsyncLocalStorage`. Todo el código asíncrono de una petición la ve sin pasarla como parámetro. |
| `tracer.ts` | `withSpan(nombre, fn)` mide una función síncrona o asíncrona y la registra como span. Si falla, guarda el error y lo relanza tal cual. |
| `trace.middleware.ts` | Abre la traza, devuelve `X-Trace-Id`, agrega `Server-Timing` y escribe una línea de log JSON por petición. |
| `trace-store.ts` | Buffer circular en memoria con las últimas N trazas. |
| `traces.routes.ts` | `GET /api/traces`, `GET /api/traces/stats`, `GET /api/traces/:traceId` y `DELETE /api/traces`. |

## Cómo usarlo

```bash
npm run docker:up
curl -i http://localhost:3000/api/postgres/users
```

```
X-Trace-Id: da02b196-9f31-4cf7-94f8-eef245ade9a5
Server-Timing: s0;dur=0.109;desc="pagination.parse", s1;dur=28.449;desc="pg.ensureUsersTable", s2;dur=3.729;desc="pg.selectUsers", total;dur=34.79
```

- **Propagación:** si el cliente u otro servicio manda `X-Trace-Id`, se reutiliza. Así una misma operación se puede seguir a través de varios servicios. Solo se aceptan ids de 8 a 128 caracteres `[A-Za-z0-9._-]`; si el id no cumple, se genera un UUID.
- **Navegador:** `Server-Timing` es un estándar W3C, y Chrome lo muestra en *DevTools → Network → Timing*. Por eso los dos headers se exponen por CORS.
- **Logs:** `docker compose logs -f api` muestra una línea por petición, que se puede buscar por traceId:
  ```json
  {"level":"info","msg":"request","traceId":"bench-aed5939f-999","method":"POST","path":"/api/postgres/users","status":201,"durationMs":4.053,"slow":false,"spans":["pg.ensureUsersTable=2.995ms","pg.insertUser=0.814ms"]}
  ```
- **Consultar trazas:**
  ```bash
  curl http://localhost:3000/api/traces?limit=5          # últimas 5
  curl http://localhost:3000/api/traces/<traceId>        # una en detalle
  curl http://localhost:3000/api/traces/stats            # p50/p95/máx por ruta
  ```
- **Arranque:** al iniciar, la API registra cuánto tardó en conectarse a cada base de datos:
  ```json
  {"level":"info","msg":"startup","readyMs":273.692,"phasesMs":{"connectPostgres":22.93,"connectMongo":19.995}}
  ```

## Variables de entorno

| Variable | Por defecto | |
|---|---|---|
| `TRACE_LOG` | `true` (en tests, `false`) | Log JSON por petición |
| `TRACE_ENDPOINT` | `true` | Habilita `/api/traces`. **Apagar en producción**, porque expone rutas y tiempos. |
| `TRACE_BUFFER_SIZE` | `500` | Trazas que se guardan en memoria |
| `TRACE_SLOW_MS` | `200` | Umbral para marcar una petición como `slow` y con `level: "warn"` |

## Para agregar un span nuevo

```ts
import { withSpan } from "../observability/tracer.js";

const rows = await withSpan("pg.selectOrders", () => pgPool.query("SELECT ..."));
```

Fuera de una petición (tests unitarios, scripts), `withSpan` solo ejecuta la función, sin costo extra.

## Límites

Es trazabilidad dentro de un solo proceso y en memoria: se pierde al reiniciar y no junta trazas de varias réplicas. El siguiente paso sería exportar los mismos spans con OpenTelemetry a Jaeger o Grafana Tempo. Los nombres de los spans y la propagación del id ya siguen esa idea.
