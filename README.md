# Express + TypeScript API (PostgreSQL + MongoDB)

API en Node.js con Express y TypeScript que expone endpoints contra PostgreSQL y MongoDB.

## Requisitos

- Node.js 18+
- PostgreSQL en ejecución
- MongoDB en ejecución

## Configuración

1. Copia el archivo de entorno:

​```bash
cp .env.example .env
​```

2. Ajusta credenciales en `.env` si hace falta.

## Instalación y arranque

​```bash
npm install
npm run dev
​```

Build de producción:

​```bash
npm run build
npm start
​```

## Ejecución con Docker (alternativa)

En vez de instalar PostgreSQL y MongoDB localmente, puedes levantar todo el stack (API + bases de datos) contenedorizado con Docker Compose.

### Requisitos

- Docker Desktop instalado y corriendo.

### Pasos

​```bash
cp .env.example .env
docker compose up --build -d
​```

Verifica que los tres servicios estén arriba y saludables:

​```bash
docker compose ps
​```

Revisa los logs de la API si necesitas depurar:

​```bash
docker compose logs -f api
​```

Para detener el stack:

​```bash
docker compose down
​```

La API queda expuesta igual en `http://localhost:3000` — los mismos endpoints y ejemplos de la sección de abajo aplican sin cambios.

> **Nota:** dentro de la red interna de Docker Compose, la API se conecta a las bases usando el nombre del servicio como host (`postgres` y `mongo`), no `localhost`. Los healthchecks de `postgres` y `mongo` aseguran que la API solo arranque cuando las bases ya están listas (`depends_on: condition: service_healthy`).

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

...(el resto igual que ya lo tienes)