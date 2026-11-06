# Medición de tiempos de rutas y bases de datos

Este directorio contiene:

- `route-timing.middleware.ts`: mide las solicitudes que Express procesa y registra los resultados en los logs de la API.
- `db-timing.ts`: script independiente que mide conexión y operaciones de prueba en PostgreSQL, MongoDB y Redis.

## Iniciar el proyecto

Abre PowerShell en la carpeta que contiene `package.json`:

```powershell
cd "C:\Users\laura\OneDrive\Documentos\Universidad\Octavo semestre\Devoops\devops-2026-2\devops-2026-2"
```

Inicia los contenedores:

```powershell
npm run docker:up
```

Si Docker informa que el puerto local `6379` está ocupado por otro servicio, publica Redis de este proyecto en el puerto `6380`. Define la variable y ejecuta Compose desde la misma terminal:

```powershell
$env:REDIS_PORT = "6380"
npm run docker:up
```

La salida `Healthy` o `Started` confirma que Docker inició los contenedores; por sí sola no ejecuta ni mide las rutas.

## Medir las rutas

Abre una **segunda terminal** en la carpeta del proyecto para ver los logs:

```powershell
cd "C:\Users\laura\OneDrive\Documentos\Universidad\Octavo semestre\Devoops\devops-2026-2\devops-2026-2"
npm run docker:logs
```

Espera hasta ver:

```text
Server running on http://localhost:3000
```

Desde una **tercera terminal**, envía solicitudes a las rutas que quieras medir. Cada solicitud genera una línea en la terminal de logs:

```powershell
curl.exe http://localhost:3000/health
curl.exe http://localhost:3000/api/postgres/health
curl.exe http://localhost:3000/api/postgres/users
curl.exe http://localhost:3000/api/mongo/health
curl.exe http://localhost:3000/api/mongo/users
curl.exe http://localhost:3000/api/redis/health
curl.exe http://localhost:3000/api/redis/users
curl.exe http://localhost:3000/api/products
```

Las líneas de tiempo se ven en la **segunda terminal** (la de `docker:logs`), no en la terminal que ejecutó `curl.exe`. El formato es:

```text
[route-timing] GET /health | 200 | 7.11 ms
```

- `GET`: método HTTP.
- `/health`: ruta solicitada.
- `200`: estado HTTP de la respuesta.
- `7.11 ms`: tiempo desde que Express recibe la solicitud hasta que termina de enviar la respuesta.

Se miden también rutas que respondan con error. El tiempo incluye los middleware, la ejecución del handler y las esperas por base de datos. No incluye el tiempo que tarda el cliente en recibir o procesar la respuesta. Los tiempos dependen del entorno y varían entre solicitudes.

Las rutas `POST` también se miden al solicitarlas, pero crean datos persistentes. Para probarlas manualmente:

```powershell
curl.exe -X POST http://localhost:3000/api/postgres/users -H "Content-Type: application/json" -d '{"name":"Prueba","email":"prueba@example.com"}'
curl.exe -X POST http://localhost:3000/api/mongo/users -H "Content-Type: application/json" -d '{"name":"Prueba","email":"prueba@example.com"}'
curl.exe -X POST http://localhost:3000/api/redis/users -H "Content-Type: application/json" -d '{"name":"Prueba","email":"prueba@example.com"}'
curl.exe -X POST http://localhost:3000/api/products -H "Content-Type: application/json" -d '{"name":"Producto de prueba","price":100}'
```

Usa un email distinto si vuelves a crear un usuario en PostgreSQL, donde el email debe ser único.

### Resultados observados de rutas

Estos resultados se obtuvieron en una ejecución anterior. Los tiempos del middleware se miden dentro de la API; el segundo conjunto fue medido desde el cliente y, por tanto, incluye la ida y vuelta por HTTP. Son históricos y pueden variar:

```text
[route-timing] GET /health | 200 | 7.11 ms

[route-benchmark] GET /health | 200 | 104.38 ms
[route-benchmark] GET /api/postgres/health | 200 | 38.65 ms
[route-benchmark] GET /api/postgres/users | 200 | 97.65 ms
[route-benchmark] POST /api/postgres/users | 201 | 42.59 ms
[route-benchmark] GET /api/mongo/health | 200 | 18.11 ms
[route-benchmark] GET /api/mongo/users | 200 | 12.99 ms
[route-benchmark] POST /api/mongo/users | 201 | 41.21 ms
[route-benchmark] GET /api/redis/health | 200 | 10.61 ms
[route-benchmark] GET /api/redis/users | 200 | 12.54 ms
[route-benchmark] POST /api/redis/users | 201 | 8.52 ms
[route-benchmark] GET /api/products | 200 | 24.01 ms
[route-benchmark] POST /api/products | 201 | 40.32 ms
```

El prefijo `[route-benchmark]` corresponde a una corrida previa de solicitudes desde el cliente. No hay un comando `routes:benchmark` en el proyecto: para obtener nuevas mediciones, envía solicitudes `curl.exe` como se indica arriba y mira la terminal de logs.

## Medir las bases de datos

Con los servicios Docker levantados, ejecuta el benchmark independiente en una terminal de PowerShell desde la carpeta que contiene `package.json`. No es necesario arrancar la API con `npm run dev`.

Si Redis está publicado en el puerto `6380`, configura su URL en la terminal que correrá el benchmark:

```powershell
$env:REDIS_URL = "redis://localhost:6380"
npm run db:benchmark
```

Si Redis está publicado en el puerto `6379`:

```powershell
npm run db:benchmark
```

El benchmark mide:

- PostgreSQL: conexión inicial (incluye la comprobación `SELECT 1` de `connectPostgres`) y una consulta `SELECT 1`.
- MongoDB: conexión y comando `ping`.
- Redis: conexión y comando `ping`.

Son verificaciones puntuales de solo lectura, no una prueba de carga. El script cierra las conexiones al terminar.

### Interpretar el resultado

Una ejecución correcta se parece a:

```text
PostgreSQL connected
[db-timing] PostgreSQL connection | 18.42 ms
[db-timing] PostgreSQL SELECT 1 | 2.71 ms
MongoDB connected
[db-timing] MongoDB connection | 35.06 ms
[db-timing] MongoDB ping | 1.94 ms
Redis connected
[db-timing] Redis connection | 12.30 ms
[db-timing] Redis ping | 1.28 ms
Redis URL: localhost:6380
```

Los valores de arriba son ejemplos registrados en una ejecución y no predicen futuras mediciones. Si una base no está disponible o rechaza credenciales, se imprime `ERROR` con el motivo y el proceso termina con código de error.

En una ejecución anterior PostgreSQL rechazó la contraseña configurada, mientras MongoDB y Redis respondieron:

```text
[db-timing] PostgreSQL connection | ERROR after 146.13 ms | la autenticación password falló para el usuario «postgres»
MongoDB connected
[db-timing] MongoDB connection | 45.15 ms
[db-timing] MongoDB ping | 5.92 ms
Redis connected
[db-timing] Redis connection | 48.24 ms
[db-timing] Redis ping | 2.05 ms
Redis URL: localhost:6380
```

Si PostgreSQL vuelve a mostrar `password authentication failed`, verifica que `POSTGRES_USER` y `POSTGRES_PASSWORD` coincidan con las credenciales de esa base. En Docker, cambiar las variables no cambia la contraseña de un volumen ya inicializado. Si Redis no conecta, verifica que `REDIS_URL` use el puerto publicado en el equipo.
