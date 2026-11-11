# Práctica: Medición de Rendimiento, Recursos y Trazabilidad de CI

Rama `timing-alarcon-daniel`, creada a partir de `products-test-alarcon` (commit `65563e0`, PR #88).  
**Autor:** Daniel Esteban Alarcón Rojas  
**Fecha de medición:** 2026-11-10  

---

## 1. Objetivo y Alcance

El objetivo de esta práctica es medir de manera cuantitativa y reproducible **cuánto se demora el servicio en ser ejecutado**, evaluar su **consumo de recursos (CPU y memoria RAM)** y establecer la **cadena de trazabilidad completa** en el ciclo de vida DevOps:

$$\text{Commit SHA} \longrightarrow \text{Rama Git} \longrightarrow \text{Pull Request} \longrightarrow \text{Workflow Run} \longrightarrow \text{Jobs} \longrightarrow \text{Steps}$$

Para resolver de manera integral la ambigüedad del requerimiento, se abordan dos perspectivas clave de ingeniería:
1. **Rendimiento y eficiencia del servicio en runtime:** Medición de latencias (promedio, P95, mín/máx), throughput (operaciones por segundo) y consumo de recursos del proceso Node.js (CPU user/system, Heap y RSS).
2. **Tiempos de ejecución de tests y pipeline CI/CD:** Duración de pared de las suites de prueba (principal y de productos) y tiempos de cada etapa del pipeline automatizado en GitHub Actions.

---

## 2. Herramientas y Scripts Desarrollados

| Archivo | Propósito / Funcionalidad |
|---|---|
| `scripts/service-benchmark.mjs` | Ejecuta pruebas de rendimiento y profiling de recursos: mide latencia por operación, throughput, uso de CPU y memoria (Heap Used, RSS). |
| `scripts/test-timing.mjs` | Ejecuta Vitest con reporter JSON, calculando tiempo total de pared, duración por archivo y ranking de tests más lentos. Compatible con `GITHUB_STEP_SUMMARY`. |
| `scripts/ci-timing.mjs` | Consulta la API de GitHub CLI (`gh`) para inspeccionar la trazabilidad completa y duración de jobs y steps en GitHub Actions. |
| `package.json` | Comandos `npm run benchmark:service`, `npm run test:timing`, `npm run test:timing:productos` y `npm run ci:timing`. |
| `.gitignore` | Ignora salidas temporales de métricas (`timing-results.json`, `benchmark-results.json`). |

### Comandos de Ejecución

```bash
# 1. Medir rendimiento del servicio y consumo de recursos
npm run benchmark:service

# 2. Medir tiempos de tests (suite principal)
npm run test:timing

# 3. Medir tiempos de tests (suite de productos - 32 tests)
npm run test:timing:productos

# 4. Consultar trazabilidad de CI del PR base (#88)
npm run ci:timing -- --run 40250745639

# 5. Consultar trazabilidad de CI de la rama actual
npm run ci:timing
```

---

## 3. Resultados: Rendimiento y Consumo de Recursos del Servicio

Las pruebas se ejecutaron sobre el entorno local:
- **SO:** Linux x86_64 (Kernel 7.3.1-cachyos)
- **Runtime:** Node.js v22.23.4 / V8 Engine
- **Framework:** Express + Vitest 5.0.3 + Supertest

### Latencia y Throughput por Operación

| Operación / Endpoint | Muestras | Promedio (ms) | P95 (ms) | Máximo (ms) | Throughput (ops/s) |
|---|---|---|---|---|---|
| `ProductStore.create()` | 1,000 | 0.024 ms | 0.036 ms | 1.288 ms | **41,950 ops/s** |
| `ProductStore.getById/Sku()` | 5,000 | 0.009 ms | 0.028 ms | 0.447 ms | **117,272 ops/s** |
| `ProductStore.list()` (Filtros + Locale 'es') | 500 | 1.243 ms | 1.364 ms | 6.644 ms | **804 ops/s** |
| `ProductStore.adjustStock()` | 2,000 | 0.001 ms | 0.001 ms | 0.078 ms | **1,744,997 ops/s** |
| `HTTP GET /health` (Express Pipeline) | 200 | 0.847 ms | 1.194 ms | 18.313 ms | **1,181 ops/s** |

### Consumo de Recursos del Proceso Node.js

| Recurso Medido | Valor Inicial | Valor Final | Variación ($\Delta$) / Uso |
|---|---|---|---|
| **Tiempo de pared total de prueba** | — | — | **0.86 s** |
| **Tiempo de CPU Total** | — | — | **895.57 ms** (849.09 ms User, 46.48 ms System) |
| **Uso equivalente de CPU** | — | — | **103.7%** (saturación de 1 núcleo en ráfaga sincrónica) |
| **Memoria Heap Usada** | 19.31 MB | 32.42 MB | **+13.11 MB** (almacenamiento de miles de objetos y cierres) |
| **Memoria RSS Total (Proceso)** | — | 161.59 MB | Estable para el runtime de Node.js + V8 |

> **Análisis DevOps de Rendimiento:**
> - Las operaciones puntuales indexadas (`getById`, `getBySku`, `adjustStock`) muestran latencias sub-milisegundo (< 0.01 ms) gracias al uso de estructuras indexadas `Map` en memoria.
> - La operación `list()` tiene un coste mayor (1.24 ms) debido a que realiza clonación profunda, filtrado secuencial y ordenamiento léxico en español (`localeCompare` con sensibilidad base).
> - El pipeline HTTP de Express introduce una latencia base de ~0.85 ms por el parseo de middlewares, enrutador y serialización JSON.

---

## 4. Resultados: Tiempos de Pruebas Automatizadas

### Suite Principal (`npm run test:timing`)
- **Resultado:** 8/8 tests aprobados (100% OK).
- **Tiempo de pared (`vitest run` completo):** **0.73 s**
- **Tiempo neto de ejecución de tests:** **0.06 s** (el 91% restante corresponde al arranque de Node.js, carga de módulos y compilación on-the-fly de TypeScript).

| Archivo de Test | Pruebas | Estado | Duración |
|---|---|---|---|
| `tests/app.test.ts` | 4 | passed | 33 ms |
| `tests/products.test.ts` | 2 | passed | 28 ms |
| `tests/pagination.service.test.ts` | 2 | passed | 2 ms |

**Top 3 tests individuales más lentos:**
1. `Products endpoints POST /api/products crea un producto y responde 201` → 24 ms
2. `API endpoints GET /health responde ok` → 18 ms
3. `API endpoints POST /api/postgres/users sin email responde 400` → 8 ms

### Suite de Productos (`npm run test:timing:productos`)
- **Resultado:** 32/32 tests aprobados (Calificación 5.0).
- **Tiempo de pared completo:** **0.63 s**
- **Tiempo neto de ejecución:** **0.03 s**

| Archivo de Test | Pruebas | Estado | Duración |
|---|---|---|---|
| `tests/practica-productos/product-store.test.ts` | 32 | passed | 25 ms |

**Top tests más lentos:**
1. Validación de SKU vacío o con formato regex inválido → 6 ms
2. Creación con asignación de ID v4, valores por defecto y fechas → 4 ms
3. Devolución de copias defensivas independientes → 2 ms

---

## 5. Resultados de CI/CD (GitHub Actions)

### Run de Referencia del PR Base (#88)
- **Repositorio:** `uni-dev-labs/devops-2026-2`
- **Rama:** `products-test-alarcon`
- **Commit SHA:** `65563e05eaafe538e5c049cf4831b042765802e4`
- **Pull Request:** [PR #88 (Open)](https://github.com/uni-dev-labs/devops-2026-2/pull/88)
- **Workflow Run:** [Run #40250745639](https://github.com/uni-dev-labs/devops-2026-2/actions/runs/40250745639)
- **Duración Total del Run:** **13 segundos**

#### Desglose de Jobs y Pasos (Steps)

```
Job "Práctica productos" [Conclusión: success] ── Duración: 7 s
   ├── 1 s  Set up job (Aprovisionamiento del contenedor runner)
   ├── 0 s  Descargar el código (actions/checkout@v4)
   ├── 2 s  Instalar Node.js (actions/setup-node@v4)
   ├── 1 s  Instalar dependencias (npm ci)
   ├── 1 s  Correr tests de productos (npm run test:productos)
   └── 0 s  Publicar nota (actions/github-script)

Job "Typecheck, tests y build" [Conclusión: success] ── Duración: 11 s
   ├── 1 s  Set up job
   ├── 1 s  Descargar el código
   ├── 2 s  Instalar Node.js
   ├── 2 s  Instalar dependencias (npm ci)
   ├── 1 s  Verificar tipos (npm run typecheck)
   ├── 0 s  Correr tests (npm test)
   └── 1 s  Compilar (npm run build)
```

---

## 6. Cadena de Trazabilidad DevOps

La trazabilidad asegura que cualquier versión del servicio desplegado o probado pueda auditarse hacia atrás hasta el autor y la línea de código exacta:

1. **Commit:** `65563e0` identifica de forma inmutable el código fuente exacto modificado por Daniel Alarcón.
2. **Rama Git:** `products-test-alarcon` aísla los cambios de la práctica de productos; la nueva rama `timing-alarcon-daniel` incorpora los scripts de medición y telemetría sin alterar la base funcional.
3. **Pull Request:** El PR #88 vincula la rama con el repositorio central `upstream`, permitiendo code review y disparando los webhooks de integración continua.
4. **Workflow Run:** GitHub Actions crea el run `40250745639` escuchando el evento `pull_request` sobre el commit de la rama.
5. **Jobs & Steps:** La ejecución paralela de `Práctica productos` y `Typecheck, tests y build` valida sintaxis, tipado estático, pruebas unitarias y generación de binarios (`dist/`).

---

## 7. Conclusiones y Diagnóstico de Eficiencia

1. **Eficiencia Algorítmica:** La implementación del almacén de productos en memoria alcanza un throughput superior a 40,000 operaciones por segundo para inserciones y más de 1.7 millones para ajustes de inventario, demostrando una complejidad algorítmica óptima $O(1)$ gracias a índices por SKU e ID.
2. **Cuello de Botella Identificado:** La operación `list()` con ordenamiento localizado (`localeCompare`) consume la mayor parte del tiempo de cómputo en búsquedas masivas. Para despliegues a gran escala, este tipo de ordenamiento debe delegarse al motor de base de datos (PostgreSQL o MongoDB) con índices adecuados.
3. **Optimización del Pipeline CI:** El tiempo de pared de CI en GitHub Actions (13 segundos) es altamente eficiente, donde los pasos de instalación (`npm ci` con caché) y setup consumen el 55% del tiempo total, mientras que la ejecución real de validaciones y compilación toma menos de 4 segundos.

