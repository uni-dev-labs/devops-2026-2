# Express + TypeScript API (PostgreSQL + MongoDB)

API en Node.js con Express y TypeScript que expone endpoints contra PostgreSQL y MongoDB.

## Requisitos

- Node.js 18+
- PostgreSQL en ejecución
- MongoDB en ejecución

## Configuración

1. Copia el archivo de entorno:

```bash
cp .env.example .env
```

2. Ajusta credenciales en `.env` si hace falta.

## Instalación y arranque (sin Docker)

Requiere PostgreSQL y MongoDB corriendo localmente.

```bash
npm install
npm run dev
```

Build de producción:

```bash
npm run build
npm start
```

## Arranque con Docker (recomendado)

Requisitos: Docker Desktop instalado y corriendo.

```bash
# 1. Copia el archivo de entorno (Compose lo lee automáticamente)
cp .env.example .env

# 2. Levanta api + postgres + mongo
docker compose up --build -d

# 3. Verifica el estado de los contenedores
docker compose ps

# 4. Sigue los logs de la API
docker compose logs -f api

# 5. Para apagar el stack
docker compose down
```

También puedes usar los scripts de npm:

```bash
npm run docker:up     # docker compose up --build -d
npm run docker:logs   # docker compose logs -f api
npm run docker:down   # docker compose down
```

Dentro de la red de Docker, la API se conecta a las bases usando el **nombre del
servicio**, no `localhost`:

- PostgreSQL → `postgres:5432`
- MongoDB → `mongodb://mongo:27017`

Desde tu máquina (host) sigues accediendo a la API en `http://localhost:3000`.

Los datos de PostgreSQL y MongoDB persisten entre reinicios gracias a los
volúmenes `postgres_data` y `mongo_data` definidos en `docker-compose.yml`.

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
