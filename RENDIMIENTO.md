# Trazabilidad: tiempo de ejecución de los servicios

Autor: Jean Carlos Reyes · Rama: `trazabilidad-reyes`

Se mide cuánto tarda cada método de los servicios de `src/services`:

- `product-store.ts`: el almacén de productos que implementé en la práctica anterior.
- `pagination.service.ts`: el cálculo de `page`, `limit` y `offset`.

## Cómo correrlo

```bash
npm install
npm run medir            # tabla de tiempos por servicio y método
N=10000 npm run medir    # mismo informe con otro tamaño de almacén
npm run medir:perfil     # guarda un perfil de CPU en debug/perfiles (ignorado por git)
npm run medir:resumen    # muestra las funciones que más CPU consumieron en ese perfil
```

`debug/medir-servicios.ts` corre cada método N veces (5000 por defecto) y mide cada llamada con `performance.now()`.
`list` recorre y ordena todo el almacén, por eso se mide con 200 llamadas.
De cada método se reporta el tiempo total, el promedio, el mínimo, el percentil 95 y el máximo.

El perfil de CPU sirve para ver dónde se va el tiempo.
Con `tsx`, Node escribe un perfil por hilo; `medir:resumen` toma el del hilo que corrió los servicios.

## Hallazgo

La primera medición mostró que `list` tardaba 148 ms por llamada con 5000 productos.
El perfil de CPU indicó que el 90,5 % del tiempo se iba en la función de comparación del `sort`:
`a.name.localeCompare(b.name, "es", { sensitivity: "base" })` crea un collator nuevo en cada comparación.

También `create`, `getBySku` y `update` con sku recorrían todo el almacén buscando el sku, así que su tiempo crecía con la cantidad de productos.

## Cambios

En `src/services/product-store.ts`:

1. Un único `Intl.Collator("es", { sensitivity: "base" })` a nivel de módulo, reutilizado en `list`. La regla de orden es la misma.
2. Un índice `Map` de sku a id (`skuIndex`) que se actualiza en `create`, `update` y `remove`. La búsqueda por sku pasa de recorrer el almacén a una consulta directa.

Los 32 tests de `npm run test:productos` siguen pasando, y `npm test` sigue en verde.

## Resultados

Node v22.19.0, 5000 productos en el almacén. Tiempo promedio por llamada, en microsegundos.

| Servicio | Método | Antes (µs) | Después (µs) | Mejora |
|---|---|---:|---:|---:|
| product-store | create | 56,79 | 9,22 | 6,2× |
| product-store | getById | 1,39 | 1,48 | = |
| product-store | getBySku | 34,05 | 1,55 | 22× |
| product-store | list (filtros) | 9 564,84 | 666,31 | 14× |
| product-store | list (todo) | 148 301,07 | 3 344,78 | 44× |
| product-store | update | 1,86 | 2,40 | = |
| product-store | adjustStock | 1,44 | 1,61 | = |
| product-store | remove | 0,35 | 0,60 | = |
| pagination.service | parsePagination (ok) | 0,63 | 0,66 | = |
| pagination.service | parsePagination (inválido) | 0,59 | 0,43 | = |

Las diferencias de menos de 1 µs son ruido de la medición.

Después del cambio, el perfil reparte el tiempo entre el ordenamiento (29,8 %) y `copy` (23 %).
`copy` es necesario porque las lecturas deben devolver copias del producto.
`list` sigue siendo el método más lento porque ordena y copia todo el almacén en cada llamada, pero ahora tarda 3,3 ms en lugar de 148 ms.

Los números cambian según la máquina y la carga del momento; lo que se mantiene es la proporción entre métodos.
