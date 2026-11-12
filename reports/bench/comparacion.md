# Benchmarks: `antes` vs `despues`

Node v24.21.0 · tiempo medio por operación (menor es mejor)

## pagination

| Operación | antes | despues | ops/s despues | Cambio |
|---|---:|---:|---:|---|
| sin query (por defecto) | 0.058 µs | 0.056 µs | 13.418.495 | ≈ igual |
| válido { page: '3', limit: '20' } | 0.067 µs | 0.067 µs | 11.704.887 | ≈ igual |
| limit mayor al máximo | 0.066 µs | 0.065 µs | 11.889.229 | ≈ igual |
| inválido { page: 'abc', limit: '-5' } | 0.132 µs | 0.130 µs | 8.534.685 | ≈ igual |

## store-100-lecturas

| Operación | antes | despues | ops/s despues | Cambio |
|---|---:|---:|---:|---|
| getById | 0.170 µs | 0.170 µs | 6.824.412 | ≈ igual |
| getBySku (último sku) | 0.700 µs | 0.184 µs | 6.185.147 | **3.8× más rápido** |
| list() sin filtros | 2.21 ms | 54.797 µs | 18.407 | **40× más rápido** |
| list({ category, minPrice, maxPrice }) | 241.057 µs | 7.036 µs | 143.498 | **34× más rápido** |
| list({ search }) | 50.849 µs | 4.096 µs | 246.681 | **12× más rápido** |

## store-100-escrituras

| Operación | antes | despues | ops/s despues | Cambio |
|---|---:|---:|---:|---|
| create + remove | 1.735 µs | 1.228 µs | 859.112 | **1.4× más rápido** |
| update({ price }) | 0.627 µs | 0.372 µs | 2.803.168 | **1.7× más rápido** |
| update({ sku }) | 0.700 µs | 0.435 µs | 2.375.489 | **1.6× más rápido** |
| adjustStock(+1) | 0.278 µs | 0.274 µs | 3.897.008 | ≈ igual |

## store-1000-lecturas

| Operación | antes | despues | ops/s despues | Cambio |
|---|---:|---:|---:|---|
| getById | 0.192 µs | 0.204 µs | 5.418.812 | ≈ igual |
| getBySku (último sku) | 6.309 µs | 0.203 µs | 6.001.510 | **31× más rápido** |
| list() sin filtros | 32.43 ms | 854.887 µs | 1.270 | **38× más rápido** |
| list({ category, minPrice, maxPrice }) | 1.74 ms | 51.326 µs | 19.702 | **34× más rápido** |
| list({ search }) | 1.29 ms | 67.968 µs | 14.822 | **19× más rápido** |

## store-1000-escrituras

| Operación | antes | despues | ops/s despues | Cambio |
|---|---:|---:|---:|---|
| create + remove | 5.523 µs | 1.303 µs | 818.334 | **4.2× más rápido** |
| update({ price }) | 3.090 µs | 0.440 µs | 2.434.527 | **7.0× más rápido** |
| update({ sku }) | 3.147 µs | 0.509 µs | 2.116.927 | **6.2× más rápido** |
| adjustStock(+1) | 0.302 µs | 0.316 µs | 3.428.284 | ≈ igual |

## store-10000-lecturas

| Operación | antes | despues | ops/s despues | Cambio |
|---|---:|---:|---:|---|
| getById | 0.192 µs | 0.190 µs | 6.189.896 | ≈ igual |
| getBySku (último sku) | 64.656 µs | 0.177 µs | 6.453.674 | **365× más rápido** |
| list() sin filtros | 353.17 ms | 8.28 ms | 121 | **43× más rápido** |
| list({ category, minPrice, maxPrice }) | 18.38 ms | 548.371 µs | 1.834 | **34× más rápido** |
| list({ search }) | 10.14 ms | 568.448 µs | 1.766 | **18× más rápido** |

## store-10000-escrituras

| Operación | antes | despues | ops/s despues | Cambio |
|---|---:|---:|---:|---|
| create + remove | 46.028 µs | 1.330 µs | 801.347 | **35× más rápido** |
| update({ price }) | 29.860 µs | 0.526 µs | 2.059.781 | **57× más rápido** |
| update({ sku }) | 28.959 µs | 0.613 µs | 1.775.399 | **47× más rápido** |
| adjustStock(+1) | 0.360 µs | 0.368 µs | 3.090.470 | ≈ igual |
