# Práctica: Tiempos de Tests y CI con Trazabilidad

Rama `trazabilidad-Preciado-Johan`, creada a partir de `products-test-preciado` (commit `5a543a7`, PR #85).  
Referencia de práctica adicional: `products-test-amaya` (commit `5c79651`, PR #69).  
Autor: Johan Preciado  
Fecha de medición: Noviembre 2026  

---

## 1. Objetivo

Medir el rendimiento y duración de cada uno de los servicios y pasos del pipeline tanto en entorno local como en CI (GitHub Actions), suministrar scripts reproducibles para su medición y documentar la **cadena de trazabilidad completa**:

$$\text{Commit} \longrightarrow \text{Rama} \longrightarrow \text{Pull Request} \longrightarrow \text{Run de CI} \longrightarrow \text{Jobs} \longrightarrow \text{Steps}$$

---

## 2. Herramientas y Archivos Agregados

| Archivo | Propósito |
|---|---|
| `scripts/test-timing.mjs` | Ejecuta vitest con reporter JSON y resume: tiempo de pared total, duración desglosada por archivo de test y top de tests individuales más lentos. Si se ejecuta dentro de GitHub Actions (`GITHUB_STEP_SUMMARY`), inyecta la tabla al resumen del run. |
| `scripts/ci-timing.mjs` | Consulta la API de GitHub Actions (o `gh` CLI si está instalado) y muestra la trazabilidad jerárquica con commit, rama, PR, run, jobs y steps junto con sus duraciones. |
| `package.json` | Incorpora los scripts ejecutables `npm run test:timing` y `npm run ci:timing`. |
| `.gitignore` | Ignora `timing-results.json` generado temporalmente por el reporter de pruebas. |
| `docs/timing/README.md` | Documentación técnica con los resultados locales, de CI y el análisis de trazabilidad. |

---

## 3. Modo de Uso

```bash
# Medir tiempos de la suite principal de tests (vitest.config.ts)
npm run test:timing

# Medir tiempos de la suite de la práctica de productos (32 tests)
npm run test:productos:timing
# o también:
npm run test:timing -- productos

# Trazabilidad y tiempos del CI (detecta automáticamente la rama o consulta la rama base)
npm run ci:timing

# Consultar un run específico de GitHub Actions por ID
npm run ci:timing -- --run 40221362842    # Run de products-test-preciado (PR #85)
npm run ci:timing -- --run 39802513841    # Run de products-test-amaya (PR #69)

# Consultar por rama específica
npm run ci:timing -- --branch products-test-preciado
```

---

## 4. Resultados en Local

Entorno: Windows, Node.js v24.15+, Vitest v5.0.3.

### 4.1. Pasos del pipeline en local (comandos de `ci.yml`)

Tiempos de ejecución medidos en local para cada uno de los servicios/etapas del pipeline:

| Paso | Comando | Tiempo |
|---|---|---|
| **Instalar dependencias** | `npm ci` | **19.4 s** |
| **Verificar tipos** | `npm run typecheck` | **4.2 s** |
| **Correr tests principales** | `npm test` | **7.3 s** |
| **Compilar TypeScript** | `npm run build` | **4.1 s** |
| **Tests de productos** | `npm run test:productos` | **3.9 s** |

### 4.2. Desglose Suite Principal (`npm run test:timing`)

- **Resultado:** OK (8/8 tests pasaron)
- **Tiempo de pared total:** ~2.1 s - 7.3 s (incluye arranque del proceso vitest, inicialización de módulos y compilación on-the-fly)
- **Tiempo neto acumulado de archivos de test:** ~0.11 s

| Archivo de Test | Tests | Estado | Duración |
|---|---|---|---|
| `tests/app.test.ts` | 4 | passed | 57 ms |
| `tests/products.test.ts` | 2 | passed | 48 ms |
| `tests/pagination.service.test.ts` | 2 | passed | 3 ms |

**Top 5 tests individuales más lentos:**
1. `Products endpoints POST /api/products crea un producto y responde 201` (42 ms)
2. `API endpoints GET /health responde ok` (30 ms)
3. `API endpoints POST /api/postgres/users sin email responde 400` (18 ms)
4. `Products endpoints POST /api/products sin precio responde 400` (6 ms)
5. `API endpoints GET /api/postgres/users devuelve la lista de usuarios` (5 ms)

### 4.3. Desglose Suite de Productos (`npm run test:timing -- productos`)

- **Resultado:** OK (32/32 tests pasaron - Nota: 5.000)
- **Tiempo de pared total:** ~1.8 s - 3.9 s
- **Tiempo neto de ejecución de tests:** ~24 ms

| Archivo de Test | Tests | Estado | Duración |
|---|---|---|---|
| `tests/practica-productos/product-store.test.ts` | 32 | passed | 24 ms |

---

## 5. Resultados en CI (GitHub Actions)

### 5.1. CI de Referencia (Run del PR #69 - `products-test-amaya`)

- **Run ID:** `39802513841`
- **URL:** <https://github.com/uni-dev-labs/devops-2026-2/actions/runs/39802513841>
- **Commit:** `5c79651`
- **Evento:** `pull_request` (PR #69)
- **Duración de Jobs:**
  - **Job "Typecheck, tests y build":** **14 s**
  - **Job "Práctica productos":** **9 s**

**Desglose de Steps de referencia (PR #69):**
```
Job "Typecheck, tests y build" [success]    14 s
      1 s  Set up job
      1 s  Descargar el código
      2 s  Instalar Node.js
      3 s  Instalar dependencias
      1 s  Verificar tipos
      1 s  Correr tests
      1 s  Compilar
      1 s  Post Instalar Node.js
      0 s  Post Descargar el código
      0 s  Complete job

Job "Práctica productos" [success]     9 s
      1 s  Set up job
      2 s  Descargar el código
      1 s  Instalar Node.js
      2 s  Instalar dependencias
      1 s  Correr tests de productos
      0 s  Publicar nota
      0 s  Post Instalar Node.js
      1 s  Post Descargar el código
      0 s  Complete job
```

---

### 5.2. CI de la Rama Base del Proyecto (`products-test-preciado`, PR #85)

- **Run ID:** `40221362842`
- **URL:** <https://github.com/uni-dev-labs/devops-2026-2/actions/runs/40221362842>
- **Commit:** `5a543a7af3986a40750bf005772514955a031b94`
- **Evento:** `pull_request` (PR #85)
- **Duración de Jobs:**
  - **Job "Typecheck, tests y build":** **14 s**
  - **Job "Práctica productos":** **9 s**

**Desglose de Steps (`products-test-preciado`):**
```
Job "Typecheck, tests y build" [success]    14 s
      1 s  Set up job
      0 s  Descargar el código
      3 s  Instalar Node.js
      2 s  Instalar dependencias
      2 s  Verificar tipos
      0 s  Correr tests
      2 s  Compilar
      0 s  Post Instalar Node.js
      0 s  Post Descargar el código
      0 s  Complete job

Job "Práctica productos" [success]     9 s
      0 s  Set up job
      1 s  Descargar el código
      2 s  Instalar Node.js
      2 s  Instalar dependencias
      1 s  Correr tests de productos
      0 s  Publicar nota
      0 s  Post Instalar Node.js
      0 s  Post Descargar el código
      0 s  Complete job
```

---

## 6. Cadena de Trazabilidad

La trazabilidad en DevOps asegura que cualquier cambio introducido en producción o validado en CI pueda rastrearse de manera bidireccional y transparente.

Cada eslabón de la cadena se compone de:

1. **Commit (SHA):** Identificador criptográfico único e inmutable del cambio (`5a543a7af3986a40750bf005772514955a031b94`).
2. **Rama:** Contexto de desarrollo donde se aisló la característica (`products-test-preciado` / `trazabilidad-Preciado-Johan`).
3. **Pull Request:** Registro de revisión e integración de código con su estado y discusiones asociadas (PR #85 / PR #69).
4. **Run de CI:** Ejecución orquestada en GitHub Actions disparada por el webhook del PR o Push (`runs/40221362842`).
5. **Jobs:** Unidades de ejecución concurrentes en máquinas virtuales independientes (`Typecheck, tests y build` y `Práctica productos`).
6. **Steps:** Pasos atómicos secuenciales dentro de cada job con medición exacta de latencia y estado (`Instalar dependencias`, `Verificar tipos`, `Correr tests`, etc.).

### Resumen de Trazabilidad:

| Eslabón | Valor Práctica Principal | Valor Referencia |
|---|---|---|
| **Rama Base** | `products-test-preciado` | `products-test-amaya` |
| **Commit SHA** | `5a543a7af3986a40750bf005772514955a031b94` | `5c796512a915539514d6b6d6e49eb111beaf235b` |
| **Pull Request** | [#85 - Johan Preciado Implementa el almacén de productos](https://github.com/uni-dev-labs/devops-2026-2/pull/85) | [#69 - Práctica productos - Amaya](https://github.com/uni-dev-labs/devops-2026-2/pull/69) |
| **Run de CI** | [Run #40221362842](https://github.com/uni-dev-labs/devops-2026-2/actions/runs/40221362842) | [Run #39802513841](https://github.com/uni-dev-labs/devops-2026-2/actions/runs/39802513841) |
| **Job 1** | `Typecheck, tests y build` (14 s) | `Typecheck, tests y build` (14 s) |
| **Job 2** | `Práctica productos` (9 s) | `Práctica productos` (9 s) |
| **Nueva Rama** | `trazabilidad-Preciado-Johan` | `timing-amaya-cristian` |

---

## 7. Comparación Local vs CI

- En los runners de GitHub Actions (`ubuntu-latest`), la ejecución de `npm test` y `typecheck` toma entre **0 s y 2 s**, mientras que en local toma entre **4 s y 7 s**.
- Esta diferencia se debe a que GitHub Actions utiliza runners Linux optimizados con almacenamiento SSD NVMe de alta velocidad, caché de dependencias npm precalentada en memoria y ausencia de sobrecargas de capas de seguridad o monitoreo de archivos que ocurren en entornos locales Windows.

