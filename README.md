# Express + TypeScript API (PostgreSQL + MongoDB)

API en Node.js con Express y TypeScript que expone endpoints contra PostgreSQL y MongoDB.

## Requisitos

- Node.js 18+ (para desarrollo local sin Docker)
- Docker Desktop (para levantar el stack completo con Compose)

## Configuración

1. Copia el archivo de entorno:

```bash
cp .env.example .env
```

2. Ajusta credenciales en `.env` si hace falta.

## Arranque con Docker (recomendado)

El stack completo (API + PostgreSQL + MongoDB) se levanta con Docker Compose. Dentro de la
red de Compose, la API se conecta a las bases usando los nombres de servicio `postgres` y
`mongo` (no `localhost`).

```bash
npm run docker:up      # docker compose up --build -d
npm run docker:logs    # docker compose logs -f api
npm run docker:down    # docker compose down
```

O directamente:

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f api
docker compose down
```

## Instalación y arranque sin Docker

Requiere PostgreSQL y MongoDB corriendo localmente (con `.env` apuntando a `localhost`).

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
| GET | `/api/postgres/users` | Lista usuarios (Postgres) |
| POST | `/api/postgres/users` | Crea usuario (Postgres) |
| GET | `/api/mongo/health` | Health de MongoDB |
| GET | `/api/mongo/users` | Lista usuarios (Mongo) |
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

## Evidencia de ejecución con Docker

### `docker compose ps`

```
NAME                       IMAGE                COMMAND                  SERVICE    STATUS                    PORTS
devops-2026-2-api-1        devops-2026-2-api    "docker-entrypoint.s…"   api        Up (running)              0.0.0.0:3000->3000/tcp
devops-2026-2-mongo-1      mongo:7              "docker-entrypoint.s…"   mongo      Up (healthy)              0.0.0.0:27017->27017/tcp
devops-2026-2-postgres-1   postgres:16-alpine   "docker-entrypoint.s…"   postgres   Up (healthy)              0.0.0.0:5432->5432/tcp
```

### Logs de la API (`docker compose logs api`)

```
api-1  | PostgreSQL connected
api-1  | MongoDB connected
api-1  | Server running on http://localhost:3000
```

### Pruebas de endpoints

```
GET  /health                  -> {"status":"ok","service":"express-ts-api"}
GET  /api/postgres/health     -> {"status":"ok","database":"postgresql","serverTime":"2026-09-03T15:05:11.617Z"}
GET  /api/mongo/health        -> {"status":"ok","database":"mongodb","ping":{"ok":1}}

POST /api/postgres/users {"name":"Ana","email":"ana@example.com"}
  -> {"database":"postgresql","data":{"id":1,"name":"Ana","email":"ana@example.com","created_at":"2026-09-03T15:05:20.020Z"}}

POST /api/mongo/users {"name":"Luis","email":"luis@example.com"}
  -> {"database":"mongodb","data":{"_id":"6a998cb0480dccd4bc490bc5","name":"Luis","email":"luis@example.com","createdAt":"2026-09-03T15:05:20.051Z"}}
```
