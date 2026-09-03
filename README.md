# Express + TypeScript API (PostgreSQL + MongoDB)

API en Node.js con Express y TypeScript que expone endpoints contra PostgreSQL y MongoDB.

## Requisitos

- Docker Desktop (opción recomendada, no necesitas instalar nada más)
- Alternativa sin Docker: Node.js 18+, PostgreSQL y MongoDB en ejecución

---

## 🐳 Arranque con Docker (recomendado)

Levanta la API, PostgreSQL y MongoDB con un solo comando.

```bash
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
docker compose up --build -d
```

Verifica que los tres servicios estén arriba y sanos:

```bash
docker compose ps
docker compose logs -f api
```

Deberías ver en los logs de `api`:

```
PostgreSQL connected
MongoDB connected
Server running on http://localhost:3000
```

### Scripts npm equivalentes

| Script | Hace |
|--------|------|
| `npm run docker:up` | `docker compose up --build -d` |
| `npm run docker:down` | `docker compose down` |
| `npm run docker:logs` | `docker compose logs -f api` |

Para borrar también los datos persistidos: `docker compose down -v`.

### Servicios del stack

| Servicio | Imagen | Puerto host | Volumen |
|----------|--------|-------------|---------|
| `api` | build local (`Dockerfile`) | 3000 | — |
| `postgres` | `postgres:16-alpine` | 5432 | `postgres_data` |
| `mongo` | `mongo:7` | 27017 | `mongo_data` |

### localhost vs nombre de servicio

Dentro de la red de Compose los contenedores se resuelven por **nombre de servicio**, no por `localhost`:

| Desde | Postgres | Mongo |
|-------|----------|-------|
| Tu PC | `localhost:5432` | `localhost:27017` |
| Contenedor `api` | `postgres:5432` | `mongodb://mongo:27017` |

Por eso `docker-compose.yml` inyecta `POSTGRES_HOST=postgres` y `MONGO_URI=mongodb://mongo:27017` al servicio `api`, sobreescribiendo lo que tengas en `.env`.

### Cómo está construida la imagen

`Dockerfile` es multi-stage:

1. **build** — `npm ci` con devDependencies y `npm run build` (TypeScript → `dist/`).
2. **runtime** — `npm ci --omit=dev` y copia solo `dist/` desde la etapa anterior.

Resultado: la imagen final no lleva TypeScript, ni `src/`, ni devDependencies, y corre como usuario sin privilegios (`USER node`).

`api` arranca solo después de que `postgres` y `mongo` pasen su healthcheck (`depends_on: condition: service_healthy`), así se evita el error de conexión en el primer arranque.

---

## Configuración

1. Copia el archivo de entorno:

```bash
cp .env.example .env
```

2. Ajusta credenciales en `.env` si hace falta.

## Instalación y arranque (sin Docker)

Requiere PostgreSQL y MongoDB corriendo en tu máquina.

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

---

## Pruebas de humo (con el stack arriba)

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/postgres/health
curl http://localhost:3000/api/mongo/health

curl -X POST http://localhost:3000/api/postgres/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Ana","email":"ana@example.com"}'

curl -X POST http://localhost:3000/api/mongo/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Luis","email":"luis@example.com"}'
```

O ejecuta el script que corre las 8 pruebas y guarda la salida en `evidencia/`:

```bash
bash scripts/evidencia.sh            # Linux / macOS / Git Bash
```

```powershell
./scripts/evidencia.ps1              # Windows PowerShell
```

## Problemas comunes

| Síntoma | Causa / solución |
|---------|------------------|
| `ECONNREFUSED 127.0.0.1:5432` dentro del contenedor | La API está usando `localhost`. Debe usar `postgres` / `mongo`. Revisa el bloque `environment` del servicio `api`. |
| `port is already allocated` (5432 / 27017 / 3000) | Ya tienes ese servicio corriendo en tu PC. Apágalo o cambia el mapeo, p. ej. `"5433:5432"`. |
| `npm ci` falla en el build | `package-lock.json` desincronizado con `package.json`. Corre `npm install` local y commitea el lock. |
| Cambios en el código no se reflejan | La imagen está cacheada: `docker compose up --build -d`. |
| Datos viejos tras cambiar credenciales de Postgres | El volumen conserva la BD anterior: `docker compose down -v`. |
