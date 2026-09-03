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

## Instalación y arranque

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