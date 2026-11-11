# Reporte de Rendimiento de Servicios — Taller de Trazabilidad

**Rama:** `trazabilidad-Taborda`  
**Entorno de ejecución:** Node.js `v24.14.1` | Windows 10 (`win32 10.0.19045 x64`)  
**Servicios evaluados:**
1. [`src/services/pagination.service.ts`](src/services/pagination.service.ts) (`parsePagination`)
2. [`src/services/product-store.ts`](src/services/product-store.ts) (`ProductStore`: `create`, `getById`, `getBySku`, `list`, `update`, `adjustStock`, `remove`)

---

## 1. Resultados con `performance.now()` y `console.time` (`npm run perf`)

Ejecutando `npm run perf` ([`scripts/medir-rendimiento.ts`](scripts/medir-rendimiento.ts)) con calentamiento JIT previo:

```text
====================================================================
  TALLER DE TRAZABILIDAD - MEDICIÓN DE RENDIMIENTO DE SERVICIOS
  Entorno: Node v24.14.1 | win32 10.0.19045 (x64)
====================================================================

[pagination.service] parsePagination (por defecto) (x10000): 2.281ms
[pagination.service] parsePagination (query válido) (x10000): 1.611ms
[pagination.service] parsePagination (limit > MAX_LIMIT) (x10000): 1.464ms
[pagination.service] parsePagination (valores inválidos) (x10000): 1.986ms
[product-store] create (x10000): 16.385ms
[product-store] getById (x10000): 7.688ms
[product-store] getBySku (x10000): 3.67ms
[product-store] update (precio y nombre) (x10000): 4.285ms
[product-store] adjustStock (+1 / -1) (x10000): 3.841ms
[product-store] list (sin filtros - 1000 items) (x1000): 12.209s
[product-store] list (con filtros - 1000 items) (x1000): 746.825ms
[product-store] remove (x10000): 3.655ms
```

### Tabla Resumen (`console.table`)

| Servicio | Operación | Iteraciones | Total (ms) | Promedio (µs) | Min (µs) | P95 (µs) | Max (µs) | Ops/seg |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| `pagination.service` | `parsePagination (por defecto)` | 10,000 | 1.43 | 0.14 | 0.00 | 0.20 | 345.30 | 6,996,432 |
| `pagination.service` | `parsePagination (query válido)` | 10,000 | 1.09 | 0.11 | 0.00 | 0.20 | 207.30 | 9,139,097 |
| `pagination.service` | `parsePagination (limit > MAX_LIMIT)` | 10,000 | 0.85 | 0.09 | 0.00 | 0.10 | 15.90 | 11,726,079 |
| `pagination.service` | `parsePagination (valores inválidos)` | 10,000 | 1.39 | 0.14 | 0.00 | 0.20 | 174.10 | 7,178,236 |
| `product-store` | `create` | 10,000 | 15.73 | 1.57 | 0.70 | 1.80 | 1,206.40 | 635,550 |
| `product-store` | `getById` | 10,000 | 6.42 | 0.64 | 0.10 | 0.60 | 1,913.20 | 1,557,972 |
| `product-store` | `getBySku` | 10,000 | 3.05 | 0.31 | 0.20 | 0.50 | 40.20 | 3,275,789 |
| `product-store` | `update (precio y nombre)` | 10,000 | 3.90 | 0.39 | 0.10 | 0.80 | 24.60 | 2,562,197 |
| `product-store` | `adjustStock (+1 / -1)` | 10,000 | 3.45 | 0.35 | 0.10 | 0.40 | 815.90 | 2,894,607 |
| `product-store` | `list (sin filtros - 1000 items)` | 1,000 | 12,208.81 | 12,208.81 | 7,604.00 | 17,851.60 | 63,942.50 | 82 |
| `product-store` | `list (con filtros - 1000 items)` | 1,000 | 746.71 | 746.71 | 678.00 | 776.00 | 27,035.60 | 1,339 |
| `product-store` | `remove` | 10,000 | 3.06 | 0.31 | 0.00 | 0.60 | 257.10 | 3,271,609 |

---

## 2. Resultados con Vitest Benchmark (`npm run bench`)

Ejecutando `npm run bench` (`vitest bench --run --reporter=verbose`):

### `bench/pagination.service.bench.ts`
| Caso de prueba | `hz` (ops/seg) | `min` (ms) | `max` (ms) | `mean` (ms) | `p75` (ms) | `p99` (ms) | `rme` | `samples` |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sin query (valores por defecto) | 24,569,978.61 | 0.0000 | 0.0779 | 0.0000 | 0.0001 | 0.0001 | ±0.10% | 31,293,000 |
| query válido (`page=3, limit=20`) | 10,601,196.75 | 0.0000 | 0.1889 | 0.0001 | 0.0001 | 0.0001 | ±0.12% | 12,724,957 |
| limit por encima del máximo (`limit=500`) | 10,551,409.82 | 0.0000 | 0.1205 | 0.0001 | 0.0001 | 0.0001 | ±0.08% | 12,612,198 |
| valores inválidos (`page=abc, limit=-5`) | 7,548,310.53 | 0.0001 | 0.4898 | 0.0002 | 0.0002 | 0.0002 | ±0.13% | 6,629,218 |

### `bench/product-store.bench.ts` — Escritura
| Caso de prueba | `hz` (ops/seg) | `min` (ms) | `max` (ms) | `mean` (ms) | `p75` (ms) | `p99` (ms) | `rme` | `samples` |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `update` de precio | 5,126,539.02 | 0.0001 | 7.0082 | 0.0002 | 0.0002 | 0.0004 | ±1.73% | 4,710,196 |
| `update` de sku (valida duplicados) | 3,571,987.06 | 0.0002 | 23.7744 | 0.0003 | 0.0003 | 0.0006 | ±5.61% | 3,057,131 |
| `adjustStock` +1 / -1 | 1,571,234.20 | 0.0005 | 0.4510 | 0.0007 | 0.0007 | 0.0010 | ±0.30% | 1,530,447 |
| `create` (almacén vacío) | 1,251,400.55 | 0.0006 | 0.3515 | 0.0008 | 0.0008 | 0.0016 | ±0.21% | 1,208,386 |
| `create + remove` (1000 productos) | 400,747.84 | 0.0007 | 6.0633 | 0.0033 | 0.0044 | 0.0060 | ±1.32% | 300,409 |

### `bench/product-store.bench.ts` — Lectura (1,000 productos)
| Caso de prueba | `hz` (ops/seg) | `min` (ms) | `max` (ms) | `mean` (ms) | `p75` (ms) | `p99` (ms) | `rme` | `samples` |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `getById` | 4,824,534.76 | 0.0001 | 0.5332 | 0.0002 | 0.0002 | 0.0004 | ±0.57% | 4,515,588 |
| `getBySku` | 3,431,368.61 | 0.0002 | 20.7602 | 0.0003 | 0.0003 | 0.0005 | ±5.07% | 3,148,432 |
| `list` con filtros (`search + category + rango de precio`) | 1,342.81 | 0.6747 | 55.3340 | 0.8649 | 0.7988 | 1.1755 | ±14.19% | 1,167 |
| `list` sin filtros (ordena todo) | 57.10 | 16.6866 | 75.7984 | 18.2555 | 17.3283 | 42.4270 | ±10.08% | 64 |

---

## 3. Conclusiones de Trazabilidad y Rendimiento

1. **`pagination.service` (`parsePagination`)** tiene complejidad $O(1)$ con un tiempo promedio de **~0.1 µs por llamada** (>7 millones de ops/seg incluso con valores inválidos).
2. **Búsquedas e indexación en `ProductStore` (`getById`, `getBySku`, `update`, `adjustStock`, `remove`)** operan en $O(1)$ gracias al uso de estructuras `Map` (`productsById` y `productsBySku`), logrando entre **1.5M y 5.1M ops/seg** (<1 µs por operación).
3. **`create`** es ligeramente más costoso (~1.57 µs por llamada) debido a la generación criptográfica de UUID (`randomUUID()`) y la clonación de fechas.
4. **`list`** es la operación más costosa ($O(N \log N)$):
   - Con filtros (`~1,340 ops/seg`, `~0.75 ms`), el filtrado previo reduce drásticamente la cantidad de elementos que pasan a `sort()`.
   - Sin filtros sobre 1,000 productos (`~57–82 ops/seg`, `~12–18 ms`), el cuello de botella principal es el ordenamiento lexicográfico con `localeCompare(..., "es", { sensitivity: "base" })` y el clonado de los 1,000 objetos.
