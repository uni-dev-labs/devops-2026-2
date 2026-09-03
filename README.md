##  Levantar el proyecto con Docker

### Requisitos
- Docker Desktop instalado y corriendo

### Pasos

1. Copia las variables de entorno:
```bash
   cp .env.example .env
```

2. Levanta el stack completo (API + PostgreSQL + MongoDB):
```bash
   docker compose up --build -d
```

3. Verifica que los 3 contenedores estén corriendo y healthy:
```bash
   docker compose ps
```

4. Revisa los logs de la API si algo falla:
```bash
   docker compose logs -f api
```

5. Prueba los endpoints:
```bash
   curl http://localhost:3000/health
   curl http://localhost:3000/api/postgres/health
   curl http://localhost:3000/api/mongo/health
```

6. Apaga el stack:
```bash
   docker compose down
```

**Nota:** el puerto de PostgreSQL se expone en `5433` en el host (en vez de `5432`) para evitar conflicto con instalaciones locales de Postgres. Internamente, dentro de la red de Docker, la API sigue conectándose por `postgres:5432`.