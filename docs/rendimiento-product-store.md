# Tiempo de ejecución de ProductStore

- Fecha: 2026-11-12T04:20:21.045Z
- Node.js: v22.19.0
- Sistema: win32 10.0.26300
- CPU: 12th Gen Intel(R) Core(TM) i5-12500H
- Duración total de la medición: 3.37 s

Tiempos en milisegundos por llamada. Cada operación se ejecuta 50 veces antes de medir.
Se genera con `npm run rendimiento`.

## Almacén con 100 productos

| Operación | Iteraciones | Promedio | Mediana | p95 | Mín | Máx | ops/s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| create | 1000 | 0.0034 | 0.0019 | 0.0045 | 0.0017 | 0.5129 | 291.409 |
| getById | 1000 | 0.0004 | 0.0004 | 0.0005 | 0.0003 | 0.0230 | 2.386.635 |
| getBySku | 1000 | 0.0016 | 0.0013 | 0.0026 | 0.0003 | 0.1135 | 629.168 |
| list (sin filtros) | 200 | 1.5135 | 1.3691 | 2.0022 | 1.2000 | 4.7602 | 661 |
| list (con filtros) | 200 | 0.0105 | 0.0096 | 0.0124 | 0.0092 | 0.0338 | 95.420 |
| update | 1000 | 0.0007 | 0.0007 | 0.0008 | 0.0006 | 0.0015 | 1.437.815 |
| adjustStock | 1000 | 0.0006 | 0.0005 | 0.0009 | 0.0004 | 0.0208 | 1.706.776 |
| remove | 1000 | 0.0037 | 0.0001 | 0.0001 | 0.0000 | 3.6242 | 268.709 |

## Almacén con 1.000 productos

| Operación | Iteraciones | Promedio | Mediana | p95 | Mín | Máx | ops/s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| create | 1000 | 0.0045 | 0.0045 | 0.0051 | 0.0028 | 0.0373 | 220.313 |
| getById | 1000 | 0.0003 | 0.0002 | 0.0003 | 0.0001 | 0.0144 | 3.951.008 |
| getBySku | 1000 | 0.0020 | 0.0019 | 0.0036 | 0.0002 | 0.0123 | 510.960 |
| list (sin filtros) | 200 | 11.0446 | 10.3347 | 15.1825 | 9.3078 | 19.2994 | 91 |
| list (con filtros) | 200 | 0.5059 | 0.4291 | 0.5952 | 0.4075 | 7.0438 | 1.977 |
| update | 1000 | 0.0007 | 0.0006 | 0.0008 | 0.0005 | 0.0558 | 1.415.629 |
| adjustStock | 1000 | 0.0006 | 0.0005 | 0.0008 | 0.0003 | 0.0498 | 1.642.845 |
| remove | 1000 | 0.0001 | 0.0001 | 0.0002 | 0.0000 | 0.0021 | 9.990.010 |
