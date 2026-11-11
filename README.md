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
## Trazabilidad y rendimiento de los servicios

Cada push a una rama `trazabilidad-*` corre el workflow **Trazabilidad y rendimiento** (`.github/workflows/rendimiento.yml`), sin pull request. Mide el rendimiento de cada servicio y deja los resultados en el resumen de la corrida (pestaña *Actions*) y como artefactos descargables.

| Job | Qué hace |
| --- | --- |
| **CI · tipos, tests y build** | Verifica tipos (API y scripts de medición), corre los tests unitarios y los 32 de la práctica de productos, y compila. Si algo falla, no se mide. |
| **Rendimiento · servicios de código** | Mide cada operación de `ProductStore` y de `pagination.service` (promedio, p50, p95, p99, máx y ops/s), cómo escala `list()` con 100, 1 000 y 5 000 productos, y la memoria por producto. Genera un perfil de CPU (`node --cpu-prof`) y muestra las funciones que más CPU consumen. |
| **CD · despliegue con Docker Compose y carga por servicio** | Construye la imagen de producción y despliega el stack completo (`api`, `postgres`, `mongo`) con `docker compose`. Luego lanza 1 000 peticiones (10 en paralelo) a cada endpoint y agrupa los resultados por servicio, registra CPU y memoria de cada contenedor con `docker stats` y apaga el stack. Si un endpoint responde con un estado inesperado, el job falla. |

Cada reporte lleva el commit, la rama, la versión de Node y la CPU del runner, así cada número se puede rastrear hasta el código que lo produjo.

### Correr las mediciones en local

```bash
npm run perf:servicios     # servicios de código; PERF_N=20000 para más llamadas
npm run perf:perfil        # perfil de CPU en perf/resultados/perfiles (se abre en Chrome DevTools)

docker compose up --build -d
npm run perf:endpoints     # carga por endpoint; API_URL, PERF_REQUESTS y PERF_CONCURRENCIA son opcionales
docker compose down
```

Los resultados quedan en `perf/resultados/` (JSON y Markdown); esa carpeta no se versiona.

### Qué revelan las mediciones

- `ProductStore.list()` es la operación más costosa: ordena todo el almacén en cada llamada con `localeCompare(…, "es", …)`, y el perfil de CPU ubica la mayor parte del tiempo en `compareProducts`. Las lecturas por id y por sku van directo a un `Map` y quedan en microsegundos.
- `GET /api/products` devuelve la colección completa, sin paginar, así que su latencia crece con la cantidad de productos. Las listas de usuarios sí paginan.
- `GET` y `POST /api/postgres/users` ejecutan `CREATE TABLE IF NOT EXISTS` en cada petición, lo que suma una consulta extra a la base por request.
