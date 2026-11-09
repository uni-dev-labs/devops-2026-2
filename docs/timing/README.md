# Práctica: tiempos de tests y de CI con trazabilidad

Rama `timing-amaya-cristian`, creada a partir de `products-test-amaya` (commit `5c79651`, PR #69).
Fecha de la medición: 2026-11-09.

## Objetivo

Medir cuánto tardan los tests del proyecto en local y en GitHub Actions, dejar herramientas
reproducibles para hacerlo y mostrar la trazabilidad completa: commit → rama → pull request → run de CI.

## Qué se agregó

| Archivo | Para qué sirve |
|---|---|
| `scripts/test-timing.mjs` | Corre vitest con el reporter JSON y resume: tiempo de pared, duración por archivo y tests más lentos. Si corre en Actions, escribe la tabla en el resumen del job. |
| `scripts/ci-timing.mjs` | Con GitHub CLI consulta un run de CI y muestra commit, rama, PR, run, jobs y steps con su duración. |
| `package.json` | Scripts `test:timing` y `ci:timing`. |
| `.gitignore` | Ignora `timing-results.json` (salida del reporter JSON). |

## Cómo usar

```bash
npm run test:timing                 # suite principal (vitest.config.ts)
npm run test:timing -- productos    # suite de la práctica de productos
npm run ci:timing                   # último run de CI de la rama actual
npm run ci:timing -- --run <id>     # un run concreto
```

Si tienes otra copia del repositorio dentro de la carpeta del proyecto, exclúyela para que vitest no cuente sus tests:

```bash
npm run test:timing -- principal --exclude "devops-2026-2/**"
```

## Resultados en local

Equipo: Windows 11, Node.js v24.19.0, vitest 5.0.3.

### Pasos del pipeline ejecutados en local (mismos comandos que `ci.yml`)

| Paso | Comando | Tiempo |
|---|---|---|
| Instalar dependencias | `npm ci` | 19.4 s |
| Verificar tipos | `npm run typecheck` | 4.2 s |
| Correr tests | `npm test` | 7.3 s |
| Compilar | `npm run build` | 4.1 s |
| Tests de productos | `npm run test:productos` | 3.9 s |

### Suite principal (`npm run test:timing`)

Tiempo de pared: 6.83 s. Tiempo sumado de los archivos de test: 0.28 s. El resto es arranque de vitest, transformación de TypeScript e importación de módulos.

| Archivo | Tests | Estado | Duración |
|---|---|---|---|
| `tests/app.test.ts` | 4 | passed | 147 ms |
| `tests/products.test.ts` | 2 | passed | 123 ms |
| `tests/pagination.service.test.ts` | 2 | passed | 9 ms |

Tests más lentos: `POST /api/products crea un producto y responde 201` (112 ms) y `GET /health responde ok` (77 ms).

### Suite de productos (`npm run test:timing -- productos`)

Tiempo de pared: 4.75 s. Tiempo sumado de los archivos de test: 0.07 s.

| Archivo | Tests | Estado | Duración |
|---|---|---|---|
| `tests/practica-productos/product-store.test.ts` | 32 | passed | 68 ms |

## Resultados en CI (GitHub Actions)

### Referencia: run del PR #69 (rama base `products-test-amaya`)

Run: <https://github.com/uni-dev-labs/devops-2026-2/actions/runs/39802513841>. Commit `5c79651`. Evento `pull_request`.

| Job | Duración |
|---|---|
| Typecheck, tests y build | 14 s |
| Práctica productos | 9 s |
| Total desde que se creó el run hasta que terminó (incluye espera por runner) | 190 s |

Steps del job "Typecheck, tests y build": instalar dependencias 3 s, verificar tipos 1 s, correr tests 1 s, compilar 1 s. El resto (checkout, setup-node, limpieza) suma unos 5 s.

### Runs recientes del workflow `CI` en `main` (upstream)

Entre el 9 de octubre y el 5 de noviembre de 2026 los runs del workflow en `main` tardaron entre 13 y 21 s cada uno, salvo uno de 9 min 59 s el 22 de octubre (PR #67). Los tiempos se ven en <https://github.com/uni-dev-labs/devops-2026-2/actions?query=branch%3Amain>.

### Run de esta rama

Se completa al abrir el pull request de `timing-amaya-cristian` hacia `uni-dev-labs:main`:

```bash
npm run ci:timing -- --branch timing-amaya-cristian
```

## Trazabilidad

La cadena que une cada pieza:

1. **Commit**: cada cambio tiene un SHA; el run de CI muestra en su cabecera el SHA que probó (`headSha`).
2. **Rama**: el run indica la rama (`headBranch`) y el evento que lo disparó (`pull_request`).
3. **Pull request**: en la pestaña *Checks* del PR aparecen los jobs del workflow con su duración y el enlace al run; en *Commits* se ve el SHA.
4. **Run**: en *Actions* → run se ven los jobs, su duración total y la de cada step.

Para esta práctica:

| Eslabón | Valor |
|---|---|
| Rama base | `products-test-amaya` (commit `5c79651`, PR #69) |
| Rama de la práctica | `timing-amaya-cristian` |
| Pull request | hacia `uni-dev-labs:main` desde `CristianAmayaDev:timing-amaya-cristian` |
| Run de CI | el que GitHub Actions genere al abrir el PR; se consulta con `npm run ci:timing -- --branch timing-amaya-cristian` |

Comparando local y CI: en el runner de GitHub los pasos de tests tardan alrededor de 1 s cada uno, frente a 4–7 s en local, porque el runner usa Node 22 en Linux con caché de npm y sin la sobrecarga de Windows.
