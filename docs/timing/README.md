# Medición de tests y CI

Estos comandos miden la suite normal, la suite de la práctica y las corridas de
GitHub Actions. Las mediciones locales describen esta máquina y pueden variar
por sistema operativo, caché y carga del equipo.

## Tests locales

```bash
npm run test:timing
npm run test:productos:timing
```

El primer comando corre la suite de `npm test`; el segundo corre la suite de
`tests/practica-productos/`. Ambos muestran duración total, duración por archivo
y los diez tests más lentos. El runner conserva el código de salida de Vitest
para que los fallos sigan siendo detectables. Los resultados se guardan en una
carpeta temporal y no modifican el reporte usado por la calificación.

## Trazabilidad del CI

```bash
npm run ci:timing
npm run ci:timing -- <sha-del-commit>
```

Sin argumentos se usa `HEAD`. El script consulta GitHub y muestra el commit,
rama, PR asociado, corrida más reciente de Actions para ese commit, jobs y steps
con sus estados y duraciones. Se requiere un remoto `origin` de GitHub y acceso
a la API. Para repositorios privados, define `GH_TOKEN` o `GITHUB_TOKEN` con
permisos de lectura de Actions y Pull requests; no guardes el token en el repo.

## Medición de esta rama

Medición local en Windows con Node.js 24.19.0, sobre el commit
`e82f83eb17f208ccb1538b0bc507732a5c4cf5b6`. Son tiempos de una corrida y pueden
variar según el equipo y la carga:

| Comando | Duración |
| --- | ---: |
| `npm run typecheck` | 2.47 s |
| `npm run test:timing` (suite general) | 1.79 s |
| `npm run test:productos:timing` (32 tests) | 1.48 s |
| `npm run build` | 2.55 s |
| `npm ci` | No medido; las dependencias ya estaban instaladas |

La corrida de CI asociada es
[#81](https://github.com/uni-dev-labs/devops-2026-2/pull/81),
[CI #72](https://github.com/uni-dev-labs/devops-2026-2/actions/runs/40132777947):

| Job | Duración |
| --- | ---: |
| Typecheck, tests y build | 18 s |
| Práctica productos | 14 s |

Los tiempos de CI incluyen la preparación del runner y la instalación de
dependencias. Para comparar `npm ci` localmente, mídelo en un checkout limpio;
no es comparable con una instalación caliente.
