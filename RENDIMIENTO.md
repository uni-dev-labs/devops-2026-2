# Medición y Análisis del Tiempo de Ejecución de los Servicios

**Fecha:** 2026-11-11  
**Rama:** `rendimiento-servicios-silva`  
**Autor:** Juan Esteban Silva  

---

## 1. Entorno de Ejecución

- **Sistema Operativo:** Windows 11
- **Runtime:** Node.js v22+
- **Herramienta de Benchmark:** Vitest v5.0.3 (`vitest bench --run --reporter=verbose`)
- **Servicios Evaluados:**
  - `src/services/pagination.service.ts` (`parsePagination`)
  - `src/services/product-store.ts` (`ProductStore`)

---

## 2. Resultados de las Mediciones (`npm run bench`)

### 2.1. Servicio de Paginación (`pagination.service`)

Mide el costo de convertir y sanitizar los parámetros del query string (`page`, `limit`) en `{ page, limit, offset }`.

| Caso de Prueba | Throughput (hz / ops/s) | Min (ms) | Max (ms) | Media (ms) | p75 (ms) | p99 (ms) | Margen Error (RME) | Muestras |
|---|---|---|---|---|---|---|---|---|
| **Sin query (valores por defecto)** | 9,417,192.18 | 0.0000 | 4.8936 | 0.0001 | 0.0001 | 0.0002 | ±1.24% | 9,699,778 |
| **Query válido (`page=3, limit=20`)** | 8,807,826.90 | 0.0000 | 1.4916 | 0.0001 | 0.0001 | 0.0003 | ±0.78% | 8,066,462 |
| **Limit excedido (`limit=500`)** | 8,492,254.44 | 0.0000 | 42.2858 | 0.0001 | 0.0002 | 0.0004 | ±8.45% | 6,770,519 |
| **Valores inválidos (`page=abc, limit=-5`)** | 3,072,740.86 | 0.0001 | 6.2217 | 0.0005 | 0.0005 | 0.0012 | ±1.80% | 2,212,407 |

---

### 2.2. Almacén de Productos (`product-store`) - Operaciones de Escritura

| Operación | Throughput (hz / ops/s) | Min (ms) | Max (ms) | Media (ms) | p75 (ms) | p99 (ms) | Margen Error (RME) | Muestras |
|---|---|---|---|---|---|---|---|---|
| **update de SKU (valida duplicados)** | 1,119,834.43 | 0.0006 | 5.4819 | 0.0011 | 0.0012 | 0.0026 | ±1.66% | 904,220 |
| **update de precio** | 793,881.06 | 0.0007 | 15.4306 | 0.0016 | 0.0015 | 0.0028 | ±4.20% | 641,928 |
| **adjustStock (+1 / -1)** | 732,698.89 | 0.0009 | 28.7235 | 0.0017 | 0.0016 | 0.0037 | ±5.89% | 602,551 |
| **create (almacén vacío)** | 409,217.56 | 0.0016 | 3.2167 | 0.0033 | 0.0036 | 0.0127 | ±1.44% | 302,889 |
| **create + remove (1000 productos)** | 108,221.86 | 0.0030 | 8.7133 | 0.0136 | 0.0136 | 0.0762 | ±2.55% | 73,519 |

---

### 2.3. Almacén de Productos (`product-store`) - Operaciones de Lectura (Catálogo de 1000 productos)

| Operación | Throughput (hz / ops/s) | Min (ms) | Max (ms) | Media (ms) | p75 (ms) | p99 (ms) | Margen Error (RME) | Muestras |
|---|---|---|---|---|---|---|---|---|
| **getById** | 2,570,220.50 | 0.0002 | 8.4499 | 0.0005 | 0.0006 | 0.0013 | ±2.88% | 1,871,278 |
| **getBySku** | 1,002,056.85 | 0.0005 | 20.6233 | 0.0014 | 0.0012 | 0.0032 | ±5.76% | 693,594 |
| **list con filtros (búsqueda + categoría + precio)** | 936.45 | 0.8530 | 35.4005 | 1.1469 | 1.1986 | 2.1140 | ±6.88% | 872 |
| **list sin filtros (ordena 1000 productos)** | 33.43 | 21.3362 | 71.6109 | 32.7493 | 36.3593 | 68.4356 | ±8.93% | 64 |

---

## 3. Análisis Técnico y Cuellos de Botella

### 3.1. Complejidad Algorítmica y Estructuras de Datos en `product-store`
1. **Lecturas O(1) vía Tablas Hash (`Map`):**
   - `getById`: Es la operación más rápida del almacén (~2.57 millones de ops/s, media de **0.0005 ms** / 0.5 µs). Utiliza `Map.prototype.get()`, seguido de una clonación superficial segura del objeto.
   - `getBySku`: Alcanza ~1.00 millón de ops/s (media de **0.0014 ms**). Aunque también es O(1), su tiempo es ligeramente superior a `getById` porque realiza normalización de cadenas (`trim().toUpperCase()`) y una doble resolución de índices (`skuIndex` -> `id` -> `products`).

2. **Operaciones de Escritura:**
   - `update` y `adjustStock`: Superan las 700k - 1.1M ops/s (media ~**0.0011 ms** a **0.0017 ms**). No requieren reasignar memoria sustancial ni reindexar la colección, manteniendo alta velocidad.
   - `create`: Ejecuta en ~**0.0033 ms** (~409k ops/s). El tiempo adicional respecto a un `update` proviene de:
     - Generación del identificador único UUID (`randomUUID()`).
     - Creación de múltiples instancias `Date` para `createdAt` y `updatedAt`.
     - Inserción simultánea en `products` y `skuIndex`.
   - `create + remove`: Alcanza ~108k ops/s (**0.0136 ms**), ya que realiza el ciclo completo de validación, inserción y borrado tanto en el mapa principal como en el índice secundario.

3. **El Cuello de Botella Principal: `list()` y `localeCompare`:**
   - `list sin filtros`: Es con diferencia la operación más costosa (**32.75 ms** de media, ~33.4 ops/s).
   - **Causa raíz:** Para ordenar 1000 elementos alfabéticamente en español, JavaScript ejecuta `left.name.localeCompare(right.name, "es", { sensitivity: "base" })`. El algoritmo de ordenamiento realiza aproximadamente $N \log_2 N$ comparaciones (~10,000 comparaciones). Cada llamada a `localeCompare` invoca internamente el subsistema de internacionalización (`Intl`), lo que resulta sumamente costoso en CPU.
   - `list con filtros`: Al filtrar primero por categoría, precio y búsqueda, la cantidad de elementos que llegan a la fase de ordenamiento se reduce drásticamente, disminuyendo el tiempo a **1.15 ms** (~936 ops/s, una mejora de 28x respecto al listado completo).

### 3.2. Rendimiento de `pagination.service`
- `parsePagination` es extremadamente liviano: alcanza entre **3.0M y 9.4M ops/s** (tiempos medios entre **0.0001 ms y 0.0005 ms**).
- Los casos válidos y por defecto se ejecutan en 100 nanosegundos.
- El caso con parámetros inválidos (`page=abc, limit=-5`) es ~3 veces más lento que los valores numéricos directos debido al paso por `Number.parseInt()` y comprobaciones `Number.isNaN()`, pero sigue siendo imperceptible en una aplicación web.

---

## 4. Pruebas de Validación del Tiempo de Ejecución

Se incluyó la suite de pruebas unitarias [tests/service-timing.test.ts](file:///d:/Varios/Varios/GitHub/proyecto_devops/tests/service-timing.test.ts) que valida empíricamente en cada ejecución de `npm test`:

1. Que `parsePagination` ejecute en promedio en menos de **0.05 ms**.
2. Que las lecturas directas por ID y SKU ejecuten en menos de **0.05 ms**.
3. Que las mutaciones individuales de producto (`update`, `adjustStock`) ejecuten en menos de **0.05 ms**.
4. Que `list()` sobre volúmenes considerables ejecute dentro de los márgenes esperados sin bloqueos del event loop.

---

## 5. Instrucciones para Reproducir

Para ejecutar los benchmarks en cualquier máquina:

```bash
# Ejecutar los benchmarks con reporte detallado
npm run bench

# Ejecutar las pruebas unitarias que validan los tiempos
npm test

# Validar los tipos de TypeScript
npm run typecheck
```
