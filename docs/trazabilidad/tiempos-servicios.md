# Trazabilidad: tiempo de ejecución de los servicios

- Fecha: 2026-11-12T05:16:40.460Z
- Node.js: v22.19.0
- Sistema: win32 10.0.26300
- CPU: AMD Ryzen 5 5600H with Radeon Graphics          (12 hilos)
- RAM: 7.4 GB
- Iteraciones por servicio: 1000 (list: hasta 200; con 10.000 productos: 50)
- Duración total de la medición: 36.70 s

Tiempos en milisegundos por llamada, medidos con `performance.now()`.
Cada servicio se ejecuta 50 veces antes de medir (calentamiento del JIT).
Se genera con `npm run trazabilidad`.

## ProductStore (100 productos)

| Servicio | Iteraciones | Promedio | Mediana | p95 | Mín | Máx | ops/s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| create | 1000 | 0,0069 | 0,0050 | 0,0080 | 0,0043 | 1,1944 | 144.630 |
| getById | 1000 | 0,0011 | 0,0010 | 0,0011 | 0,0008 | 0,1137 | 902.201 |
| getBySku | 1000 | 0,0013 | 0,0012 | 0,0015 | 0,0011 | 0,0311 | 740.850 |
| list (sin filtros) | 200 | 4,0407 | 3,6785 | 5,3181 | 3,3871 | 11,5561 | 247 |
| list (search + category + precio) | 200 | 0,1700 | 0,1214 | 0,2421 | 0,1180 | 6,4326 | 5.882 |
| update | 1000 | 0,0021 | 0,0017 | 0,0035 | 0,0015 | 0,1288 | 479.088 |
| adjustStock | 1000 | 0,0015 | 0,0015 | 0,0017 | 0,0013 | 0,0160 | 665.735 |
| remove | 1000 | 0,0005 | 0,0004 | 0,0006 | 0,0003 | 0,0479 | 2.004.008 |

## ProductStore (1.000 productos)

| Servicio | Iteraciones | Promedio | Mediana | p95 | Mín | Máx | ops/s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| create | 1000 | 0,0086 | 0,0036 | 0,0065 | 0,0029 | 4,2862 | 115.693 |
| getById | 1000 | 0,0007 | 0,0006 | 0,0008 | 0,0005 | 0,0430 | 1.470.805 |
| getBySku | 1000 | 0,0010 | 0,0010 | 0,0012 | 0,0008 | 0,0289 | 956.206 |
| list (sin filtros) | 200 | 28,5727 | 27,0438 | 38,9912 | 25,7613 | 40,4729 | 35 |
| list (search + category + precio) | 200 | 4,0865 | 3,8351 | 4,2745 | 3,7174 | 12,8338 | 245 |
| update | 1000 | 0,0017 | 0,0017 | 0,0019 | 0,0014 | 0,0108 | 591.296 |
| adjustStock | 1000 | 0,0017 | 0,0015 | 0,0031 | 0,0013 | 0,0140 | 576.668 |
| remove | 1000 | 0,0006 | 0,0004 | 0,0005 | 0,0003 | 0,0862 | 1.798.885 |

## ProductStore (10.000 productos)

| Servicio | Iteraciones | Promedio | Mediana | p95 | Mín | Máx | ops/s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| create | 1000 | 0,0036 | 0,0028 | 0,0055 | 0,0024 | 0,1108 | 279.384 |
| getById | 1000 | 0,0010 | 0,0008 | 0,0014 | 0,0005 | 0,0745 | 984.543 |
| getBySku | 1000 | 0,0015 | 0,0012 | 0,0033 | 0,0008 | 0,0581 | 647.082 |
| list (sin filtros) | 50 | 243,1589 | 247,0989 | 260,6494 | 225,1443 | 268,9353 | 4 |
| list (search + category + precio) | 50 | 26,5078 | 25,4532 | 36,5720 | 24,6647 | 36,8623 | 38 |
| update | 1000 | 0,0020 | 0,0018 | 0,0024 | 0,0014 | 0,1180 | 491.594 |
| adjustStock | 1000 | 0,0018 | 0,0015 | 0,0019 | 0,0011 | 0,1452 | 548.035 |
| remove | 1000 | 0,0004 | 0,0003 | 0,0004 | 0,0002 | 0,0525 | 2.673.082 |

## pagination.service

| Servicio | Iteraciones | Promedio | Mediana | p95 | Mín | Máx | ops/s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| parsePagination (válido) | 1000 | 0,0005 | 0,0005 | 0,0005 | 0,0004 | 0,0337 | 1.889.645 |
| parsePagination (inválido -> defecto) | 1000 | 0,0005 | 0,0005 | 0,0005 | 0,0004 | 0,0315 | 1.941.371 |

## Resumen general

- Llamadas medidas: 20.900
- Tiempo medido acumulado: 20.896,52 ms
- Promedio general por llamada: 0,9998 ms
- Servicio más lento: `list (sin filtros)` en ProductStore (10.000 productos) (243,1589 ms en promedio)
