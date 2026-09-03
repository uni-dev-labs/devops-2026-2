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

```powershell
curl http://localhost:3000/health

curl http://localhost:3000/api/postgres/health
curl -X POST http://localhost:3000/api/postgres/users `
  -H "Content-Type: application/json" `
  -d '{"name":"Ana","email":"ana@example.com"}'

curl http://localhost:3000/api/mongo/health
curl -X POST http://localhost:3000/api/mongo/users `
  -H "Content-Type: application/json" `
  -d '{"name":"Luis","email":"luis@example.com"}'
```

Body esperado en POST `/users`:

```json
{
  "name": "Nombre",
  "email": "correo@example.com"
}
```

## Ejecución de docker

Una vez configurados los archivos `.dockerignore`, `docker-compose.yml` y `dockerfile`, ejecuta el siguiente comando desde la carpeta raíz del proyecto:

```bash
docker compose up -d --build
```

Este comando permite construir la imagen y levantar en segundo plano los contenedores con todos sus servicios, basándose en la configuración de los tres archivos principales de Docker. En ellos se especifican, entre otros aspectos, la imagen que se utilizará, las configuraciones propias de la imagen, los servicios, las redes, los volúmenes y los comandos necesarios para que la aplicación dockerizada funcione correctamente.

Para realizar un seguimiento en vivo de los cambios, mensajes y eventos de los contenedores, ejecuta:

```bash
docker compose logs -f
```

La opción `-f` mantiene los registros abiertos y muestra en tiempo real la actividad de todos los servicios definidos en Docker Compose. Para detener el seguimiento, presiona `Ctrl+C`.

Para detener y eliminar los contenedores y la red creados por Docker Compose, ejecuta:

```bash
docker compose down
```

Este comando detiene y elimina los contenedores del proyecto, pero conserva los volúmenes de PostgreSQL y MongoDB para no perder los datos almacenados.


## Errores presentados

Durante la configuración y ejecución del proyecto se presentaron los siguientes errores:

1. **Dependencias de bases de datos no disponibles:** aunque se instalaron las dependencias del proyecto y se ejecutó `npm run dev`, la aplicación no iniciaba correctamente porque PostgreSQL y MongoDB no estaban instalados ni iniciados. La API necesita conectarse a ambos gestores de bases de datos para funcionar.

2. **Servicios de Docker Compose no definidos correctamente:** al copiar la configuración de Docker Compose de la guía, inicialmente solo se tenía la configuración de la API y no se había declarado correctamente la sección `services`, que es la que permite definir los servicios que administrará Docker Compose.

3. **Servicios de bases de datos faltantes:** después de declarar correctamente el servicio de la API, todavía faltaban los servicios `postgres` y `mongo`. Sin estas definiciones, Docker Compose no podía crear ni iniciar los contenedores de las bases de datos que necesita la aplicación.

4. **Volúmenes no declarados:** al agregar los servicios de PostgreSQL y MongoDB se configuraron volúmenes para conservar los datos, pero todavía no se había creado la sección principal `volumes` al final del archivo. Por ello, `postgres_data` y `mongo_data` se usaban en los servicios sin haber sido declarados.

5. **Autenticación de MongoDB:** después de declarar los servicios y corregir los volúmenes, la conexión con PostgreSQL funcionaba, pero las operaciones de escritura en MongoDB fallaban. MongoDB se configuró con un usuario y una contraseña mediante `MONGO_INITDB_ROOT_USERNAME` y `MONGO_INITDB_ROOT_PASSWORD`, mientras que la API utilizaba una URI sin credenciales. Por eso MongoDB permitía comprobar que el servidor respondía, pero rechazaba la inserción con el error `Command insert requires authentication`. Se solucionó incluyendo las credenciales y `authSource=admin` en `MONGO_URI`.

## Pruebas al contenedor

A continuación se muestran los comandos ejecutados desde PowerShell y las respuestas obtenidas al probar el contenedor.

### Comprobación de salud

#### API

Comando:

```powershell
curl.exe http://localhost:3000/health
```

Respuesta:

```json
{"status":"ok","service":"express-ts-api"}
```

#### PostgreSQL

Comando:

```powershell
curl.exe http://localhost:3000/api/postgres/health
```

Respuesta:

```json
{"status":"ok","database":"postgresql","serverTime":"2026-09-03T14:59:14.691Z"}
```

#### MongoDB

Comando:

```powershell
curl.exe http://localhost:3000/api/mongo/health
```

Respuesta:

```json
{"status":"ok","database":"mongodb","ping":{"ok":1}}
```

### Creación de usuarios

#### Usuario en PostgreSQL

Comando:

```powershell
curl.exe -X POST http://localhost:3000/api/postgres/users `
  -H "Content-Type: application/json" `
  -d '{"name":"Diego","email":"diego@example.com"}'
```

Respuesta:

```json
{"database":"postgresql","data":{"id":7,"name":"Diego","email":"diego@example.com","created_at":"2026-09-03T15:02:39.671Z"}}
```

#### Usuario en MongoDB

Comando:

```powershell
curl.exe -X POST http://localhost:3000/api/mongo/users `
  -H "Content-Type: application/json" `
  -d '{"name":"Pedrito","email":"pedrito@example.com"}'
```

Respuesta:

```json
{"database":"mongodb","data":{"_id":"6a998c65e535f5df9e796fd9","name":"Pedrito","email":"pedrito@example.com","createdAt":"2026-09-03T15:04:05.684Z"}}
```

### Verificación y detención de los contenedores

Primero se consulta el estado de los servicios con `docker compose ps`:

```text
PS C:\Users\DIEGO A\Documents\Docker DevOps\devops-2026-2> docker compose ps
NAME                       IMAGE                COMMAND                  SERVICE    CREATED              STATUS                    PORTS
devops-2026-2-api-1        devops-2026-2-api    "docker-entrypoint.s…"   api        59 seconds ago       Up 48 seconds             0.0.0.0:3000->3000/tcp, [::]:3000->3000/tcp
devops-2026-2-mongo-1      mongo:7              "docker-entrypoint.s…"   mongo      About a minute ago   Up 58 seconds (healthy)   0.0.0.0:27017->27017/tcp, [::]:27017->27017/tcp
devops-2026-2-postgres-1   postgres:16-alpine   "docker-entrypoint.s…"   postgres   About a minute ago   Up 58 seconds (healthy)   0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp

Después se detienen y eliminan los contenedores con `docker compose down`:

```text
PS C:\Users\DIEGO A\Documents\Docker DevOps\devops-2026-2> docker compose down
[+] down 4/4
 ✔ Container devops-2026-2-api-1      Removed
 ✔ Container devops-2026-2-mongo-1    Removed
 ✔ Container devops-2026-2-postgres-1 Removed
 ✔ Network devops-2026-2_default      Removed
```