# Express + TypeScript API (PostgreSQL + MongoDB)

API en Node.js con Express y TypeScript que expone endpoints contra PostgreSQL y MongoDB.

## Requisitos

- Node.js 18+ (para desarrollo local sin Docker)
- Docker y Docker Compose (recomendado para levantar todo el stack)

## Configuración

1. Copia el archivo de entorno:

```bash
cp .env.example .env
```

2. Ajusta credenciales en `.env` si hace falta.

---

## 🐳 Ejecución con Docker Compose (Recomendado)

Docker Compose levanta la API, PostgreSQL y MongoDB configurados en la misma red con persistencia de datos y healthchecks.

### Levantar el stack completo

```bash
docker compose up --build -d
# O usando el script npm:
npm run docker:up
```

### Ver logs de la API

```bash
docker compose logs -f api
# O usando el script npm:
npm run docker:logs
```

### Ver estado de los contenedores

```bash
docker compose ps
```

### Detener el stack

```bash
docker compose down
# O usando el script npm:
npm run docker:down
```

---

## 💻 Desarrollo Local (Sin Docker)

```bash
npm install
npm run dev
```

Build de producción:

```bash
npm run build
npm start
```

---

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

### Pruebas de humo / Ejemplos con `curl`

```bash
# Health checks
curl http://localhost:3000/health
curl http://localhost:3000/api/postgres/health
curl http://localhost:3000/api/mongo/health

# Crear usuario en PostgreSQL
curl -X POST http://localhost:3000/api/postgres/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Ana","email":"ana@example.com"}'

# Listar usuarios en PostgreSQL
curl http://localhost:3000/api/postgres/users

# Crear usuario en MongoDB
curl -X POST http://localhost:3000/api/mongo/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Luis","email":"luis@example.com"}'

# Listar usuarios en MongoDB
curl http://localhost:3000/api/mongo/users
```

Body esperado en POST `/users`:

```json
{
  "name": "Nombre",
  "email": "correo@example.com"
}
```
