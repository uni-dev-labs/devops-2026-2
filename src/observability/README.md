# Trazabilidad de tiempos de ejecución

Mide cuánto tarda cada petición HTTP, cada función de servicio y cada consulta a base de datos,
y las une en una sola **traza** por petición.

## Conceptos

| Término | Significado |
|---|---|
| **Span** | Medición de una unidad de trabajo (nombre, capa, duración, estado). |
| **Traza** | Conjunto de spans de una misma petición; comparten `traceId`. |
| **Capa** | `http` (petición completa), `service` (lógica) o `db` (consultas). |
| **parentSpanId** | Span que llamó a este. Permite reconstruir `http → service → db`. |

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `timing-sink.ts` | Tipo `Span`, interfaz `TimingSink` y sus implementaciones (consola, no-op, memoria). |
| `trace-context.ts` | Contexto de la traza actual (`AsyncLocalStorage`). |
| `timing.ts` | `withTiming(capa, nombre, fn)` y `startSpan`. Núcleo de la medición. |
| `request-trace.middleware.ts` | Crea el `traceId` por petición y mide la petición completa. |

## Cómo se usa

```ts
import { withTiming } from "../observability/timing.js";

// Síncrona o asíncrona: devuelve lo mismo que la función original.
const rows = await withTiming("db", "postgres.users.select", () => pgPool.query(sql, params));
```

Qué está instrumentado:

- **http**: todas las rutas (middleware global).
- **service**: `parsePagination`. Cualquier otra función de servicio se mide envolviéndola con `withTiming("service", ...)`.
- **db**: todas las consultas de Postgres y Mongo, y la conexión al arrancar.

## Ejemplo de salida

Una línea JSON por span. Una petición `GET /api/postgres/users`:

```json
{"type":"span","traceId":"8f1c…","spanId":"a1b2c3d4","parentSpanId":"e5f6a7b8","layer":"service","name":"parsePagination","durationMs":0.04,"status":"ok", "...":"..."}
{"type":"span","traceId":"8f1c…","spanId":"c9d0e1f2","parentSpanId":"e5f6a7b8","layer":"db","name":"postgres.ensureUsersTable","durationMs":3.2,"status":"ok", "...":"..."}
{"type":"span","traceId":"8f1c…","spanId":"13a4b5c6","parentSpanId":"e5f6a7b8","layer":"db","name":"postgres.users.select","durationMs":1.7,"status":"ok", "...":"..."}
{"type":"span","traceId":"8f1c…","spanId":"e5f6a7b8","layer":"http","name":"GET /api/postgres/users","durationMs":6.1,"status":"ok","meta":{"statusCode":200}}
```

Cada respuesta incluye el header `X-Trace-Id`, para buscar en los logs todo lo que pasó en esa petición:

```bash
curl -i http://localhost:3000/api/postgres/users     # copiar X-Trace-Id
docker compose logs api | grep 8f1c                  # en PowerShell: ... | Select-String 8f1c
```

Los spans se escriben al terminar, por eso el `http` (el más externo) aparece al final.

## Configuración

`TRACE_TIMING=true|false` en `.env`. Si no se define, está activa salvo en tests (`NODE_ENV=test`).

## Decisiones de diseño

- **`performance.now()` y no `Date.now()`**: reloj monotónico, con resolución sub-milisegundo y sin
  saltos por ajustes del reloj del sistema.
- **`AsyncLocalStorage`**: propaga el `traceId` a través de `await` sin pasarlo por parámetro en
  cada función. Las peticiones concurrentes no se mezclan (hay un test que lo verifica).
- **`TimingSink` (interfaz)**: quien mide no sabe a dónde van los datos. Cambiar a un archivo o a
  Prometheus es agregar una clase, no modificar la medición (Open/Closed, Dependency Inversion).
- **Mide también los errores**: `withTiming` registra el span con `status: "error"` y relanza el
  error original sin alterarlo.

## Limitaciones conocidas

- Los spans no se envían a un backend externo (solo consola). La interfaz `TimingSink` deja el punto
  de extensión listo.
- Una petición cancelada por el cliente antes de terminar no emite su span `http` (se escucha el
  evento `finish` de la respuesta).
- Los tiempos de una sola petición son ruidosos (JIT, caché fría). Para comparar rendimiento hay
  que repetir la medición y mirar percentiles, no un valor aislado.
