# Express + TypeScript API (PostgreSQL + MongoDB)

API en Node.js con Express y TypeScript que expone endpoints contra PostgreSQL y MongoDB.

## Requisitos

### Con Docker (recomendado)
- Docker Desktop instalado y corriendo

### Sin Docker (local)
- Node.js 18+
- PostgreSQL en ejecución
- MongoDB en ejecución

## 🐳 Levantar el proyecto con Docker

Esta es la forma recomendada: no necesitas instalar Postgres ni Mongo en tu máquina, Docker Compose los levanta por ti junto con la API.

1. Copia el archivo de entorno:

```bash
cp .env.example .env
```

2. Levanta el stack completo (api + postgres + mongo):

```bash
docker compose up --build -d
```

3. Verifica que los 3 servicios estén corriendo (postgres y mongo deben decir `healthy`):

```bash
docker compose ps
```

4. Revisa logs de la API si algo falla:

```bash
docker compose logs -f api
```

5. Para detener el stack:

```bash
docker compose down
```

> ⚠️ **Nota sobre red interna:** dentro de `docker-compose.yml`, la API se conecta a las bases usando los *nombres de servicio* (`postgres`, `mongo`), no `localhost`. Docker crea una red interna donde esos nombres actúan como hostnames. Desde tu máquina (fuera de los contenedores), en cambio, sí usas `localhost` gracias al mapeo de puertos definido en `ports:`.

### Scripts npm opcionales

Si agregas estos scripts en `package.json`, puedes usar:

```bash
npm run docker:up      # equivalente a: docker compose up --build -d
npm run docker:down    # equivalente a: docker compose down
npm run docker:logs    # equivalente a: docker compose logs -f api
```

## Configuración (modo local, sin Docker)

1. Copia el archivo de entorno:

```bash
cp .env.example .env
```

2. Ajusta credenciales en `.env` si hace falta.

## Instalación y arranque (modo local, sin Docker)

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

### Ejemplos (PowerShell)

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/health"

Invoke-RestMethod -Uri "http://localhost:3000/api/postgres/health"
Invoke-RestMethod -Uri "http://localhost:3000/api/postgres/users" -Method POST -ContentType "application/json" -Body '{"name":"Ana","email":"ana@example.com"}'

Invoke-RestMethod -Uri "http://localhost:3000/api/mongo/health"
Invoke-RestMethod -Uri "http://localhost:3000/api/mongo/users" -Method POST -ContentType "application/json" -Body '{"name":"Luis","email":"luis@example.com"}'
```

### Ejemplos (cmd.exe)

```cmd
curl http://localhost:3000/health

curl http://localhost:3000/api/postgres/health
curl -X POST http://localhost:3000/api/postgres/users -H "Content-Type: application/json" -d "{\"name\":\"Ana\",\"email\":\"ana@example.com\"}"

curl http://localhost:3000/api/mongo/health
curl -X POST http://localhost:3000/api/mongo/users -H "Content-Type: application/json" -d "{\"name\":\"Luis\",\"email\":\"luis@example.com\"}"
```

Body esperado en POST `/users`:

```json
{
  "name": "Nombre",
  "email": "correo@example.com"
}
```