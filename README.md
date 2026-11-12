# Express + TypeScript API (PostgreSQL + MongoDB)

API en Node.js con Express y TypeScript que expone endpoints contra PostgreSQL y MongoDB.

## Requisitos

- Node.js 18+
- Docker / Docker Compose (recomendado)
- O PostgreSQL y MongoDB locales si no usas Docker

## Configuración

1. Copia el archivo de entorno:

```bash
cp .env.example .env
```

2. Ajusta credenciales en `.env` si hace falta.

## Arranque con Docker (API + Postgres + Mongo)

Levanta todo el stack:

```bash
npm run docker:up
```

API en `http://localhost:3000`. Logs y parada:

```bash
npm run docker:logs
npm run docker:down
```

Solo bases de datos (API en local con `npm run dev`):

```bash
docker compose up -d postgres mongo
```

## Instalación y arranque local

```bash
npm install
npm run dev
```

Build de producción:

```bash
npm run build
npm start
```

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Health del API |
| GET | `/api/postgres/health` | Health de PostgreSQL |
| GET | `/api/postgres/users?page=1&limit=10` | Lista usuarios paginados (Postgres) |
| POST | `/api/postgres/users` | Crea usuario (Postgres) |
| GET | `/api/mongo/health` | Health de MongoDB |
| GET | `/api/mongo/users?page=1&limit=10` | Lista usuarios paginados (Mongo) |
| POST | `/api/mongo/users` | Crea usuario (Mongo) |

### Ejemplos

```bash
curl http://localhost:3000/health

curl http://localhost:3000/api/postgres/health
curl -X POST http://localhost:3000/api/postgres/users ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"Ana\",\"email\":\"ana@example.com\"}"

curl http://localhost:3000/api/mongo/health
curl -X POST http://localhost:3000/api/mongo/users ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"Luis\",\"email\":\"luis@example.com\"}"
```

Body esperado en POST `/users`:

```json
{
  "name": "Nombre",
  "email": "correo@example.com"
}
```
## Levantar con Docker

### Requisitos previos
- Docker Desktop instalado y corriendo
- Node.js 18+ (opcional si solo vas a usar Docker)

### Pasos

1. Copia el archivo de entorno:
```bash
   cp .env.example .env
```
   En Windows PowerShell:
```powershell
   Copy-Item .env.example .env
```

2. Levanta el stack completo (API + PostgreSQL + MongoDB):
```bash
   docker compose up --build -d
```

3. Verifica que los tres contenedores estén corriendo y en estado `healthy`:
```bash
   docker compose ps
```

4. Prueba los endpoints de salud:
```bash
   curl http://localhost:3000/health
   curl http://localhost:3000/api/postgres/health
   curl http://localhost:3000/api/mongo/health
```

   > **Nota (Windows/PowerShell):** usa `curl.exe` en lugar de `curl` para evitar que PowerShell lo interprete como `Invoke-WebRequest`.

5. Prueba la creación de usuarios:
```bash
   curl -X POST http://localhost:3000/api/postgres/users \
     -H "Content-Type: application/json" \
     -d '{"name":"Ana","email":"ana@example.com"}'

   curl -X POST http://localhost:3000/api/mongo/users \
     -H "Content-Type: application/json" \
     -d '{"name":"Luis","email":"luis@example.com"}'
```

   En Windows PowerShell, usa `Invoke-RestMethod` en su lugar:
```powershell
   Invoke-RestMethod -Uri "http://localhost:3000/api/postgres/users" -Method Post -ContentType "application/json" -Body '{"name":"Ana","email":"ana@example.com"}'

   Invoke-RestMethod -Uri "http://localhost:3000/api/mongo/users" -Method Post -ContentType "application/json" -Body '{"name":"Luis","email":"luis@example.com"}'
```

6. Revisa los logs del servicio API si necesitas depurar algo:
```bash
   docker compose logs -f api
```

7. Para detener el stack:
```bash
   docker compose down
```

### Arquitectura del stack
- **api** — Node.js/Express/TypeScript, expuesto en el puerto `3000`
- **postgres** — PostgreSQL 16, expuesto en el puerto `5432`
- **mongo** — MongoDB 7, expuesto en el puerto `27017`

Dentro de la red de Docker, la API se conecta a las bases usando el nombre del servicio (`postgres` y `mongo`), no `localhost`.

## Trazabilidad: tiempos de ejecución

### 1. Tiempo de cada servicio (script)

```bash
npm run trazabilidad           # 1000 iteraciones por servicio
npm run trazabilidad -- 5000   # iteraciones personalizadas
```

Mide con `performance.now()` cada método de `ProductStore` (`create`, `getById`, `getBySku`, `list` sin y con filtros, `update`, `adjustStock`, `remove`) con almacenes de 100, 1.000 y 10.000 productos, y el servicio `parsePagination`. Por cada servicio calcula promedio, mediana, p95, mínimo, máximo y ops/s.

El reporte queda en [`docs/trazabilidad/tiempos-servicios.md`](docs/trazabilidad/tiempos-servicios.md) y en `.csv`.

**Hallazgo:** `list()` sin filtros es el servicio más costoso y crece con el número de productos (≈1 ms con 100, ≈8 ms con 1.000 y ≈75 ms con 10.000), porque en cada llamada ordena todo el almacén por nombre con `localeCompare` y copia cada producto. Con filtros es más rápido porque ordena menos elementos. El resto de operaciones (búsqueda por id o sku, `update`, `adjustStock`, `remove`) se mantienen por debajo de 0,01 ms.

### 2. Tiempo de cada endpoint (middleware)

Cada petición pasa por `src/middlewares/trazabilidad.ts`, que:

- agrega la cabecera `X-Request-Id` (respeta la que envíe el cliente) para seguir la petición en los logs,
- agrega la cabecera `X-Response-Time` con lo que tardó la respuesta,
- imprime `[trazabilidad] <id> MÉTODO ruta -> status en X ms` en consola,
- acumula los tiempos por endpoint (agrupando rutas con parámetros).

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/trazabilidad` | Resumen por endpoint (llamadas, errores 5xx, promedio, mín, máx, p95, total) y resumen general |
| DELETE | `/api/trazabilidad` | Reinicia las métricas |

```bash
curl -i http://localhost:3000/health
curl http://localhost:3000/api/trazabilidad
```

Las pruebas están en `tests/trazabilidad.test.ts`.
