# CI (GitHub Actions)

Archivo: `.github/workflows/ci.yml`. Corre en cada pull request y en cada push a `main`.

## Qué comprueba

Un solo job, `types, lint and tests`, en Ubuntu con Node 22:

1. `npm ci` (con un `DATABASE_URL` de relleno **solo en este paso**: `prisma generate` necesita el esquema; con esa variable presente durante las pruebas la app conectaría el candado de Postgres e intentaría abrir una conexión).
2. `npm audit --omit=dev --audit-level=critical`: falla si alguna dependencia de producción tiene una vulnerabilidad crítica publicada (el RCE de Next.js 16.3.5 era una). Consulta el registro de npm, así que un día sin red o con el registro caído lo pone en rojo sin que haya un problema real: se vuelve a correr. El nivel es `critical` y no `high` porque `prisma` arrastra `deepmerge-ts`, con una vulnerabilidad alta que solo toca al CLI y que se resuelve con Prisma 7; cuando se migre, el nivel sube a `high`.
3. `npx next typegen`: Next genera los tipos globales de rutas (`LayoutProps`, `PageProps`…) y en un checkout limpio no existen hasta que esto corre.
4. `npx tsc --noEmit`
5. `npx eslint lib app tests`
6. `npm run format:check`: Prettier verifica el formato sin modificar archivos (`.prettierignore` define qué se revisa).
7. `npm run test:coverage`: la suite completa una sola vez, con cobertura (ver [Cobertura](#cobertura)). Falla si una prueba falla o si la cobertura del backend baja de los umbrales.
8. **Coverage summary** (`if: always()`): agrega el resumen de texto (`coverage/resumen.txt`) al resumen del job en GitHub.
9. **Upload coverage report** (`if: always()`, `actions/upload-artifact@v4`): sube la carpeta `coverage/` como artefacto `coverage` (14 días), también cuando los umbrales fallan.
10. `npx vitest run --config vitest.perf.config.ts`: las pruebas de rendimiento (latencia P99, crecimiento del heap, ReDoS) corren solas, después de la suite principal. En paralelo con los demás archivos compiten por CPU y sus límites de tiempo fallan sin que haya un problema real.

Un segundo job, `database (migrations, SQL files, SQL rules and smoke)`, levanta PostgreSQL 16 (la versión del servidor) como servicio y comprueba la base: `npm run db:test` (arma una base desechable con las migraciones y los archivos de `prisma/sql` y `prisma/seeds/catalogos`, y corre `prisma/tests/*.sql`), después aplica migraciones y archivos SQL a la base del servicio y corre las pruebas de humo (`npm run smoke:postgres`). Es un check aparte: **no forma parte del ruleset de `main` hasta que se agregue a mano**.

El primer job no necesita secretos: las pruebas usan almacenes en memoria y adaptadores fake. Su `npm ci` corre el script `prepare`, que no instala el hook de pre-commit porque GitHub Actions define `CI` (ver [desarrollo.md](desarrollo.md#hook-de-pre-commit)). No corre `next build`: el build necesita variables de entorno y se comprueba al construir la imagen Docker del servidor (`npm run build:no-db`).

## Cobertura

La configuración está en `vitest.config.ts` (bloque `coverage`), con el proveedor v8 (`@vitest/coverage-v8`, fijado a la misma versión que `vitest`). Solo se mide con `npm run test:coverage`: `npm test` y `npx vitest run` siguen sin cobertura y rápidos.

- **Qué mide:** `lib/**` y `app/**`. Se excluyen los archivos que solo declaran tipos (al compilarlos no queda código que ejecutar), listados en `ARCHIVOS_SOLO_TIPOS`. `lib/fsm/core/types.ts` no está en la lista: además de tipos importa `SlotKey` como valor.
- **Reportes (`coverage/`, ignorada por git y por Prettier):** `text-summary` en la consola y en `coverage/resumen.txt`, `html` (abrir `coverage/index.html`), `json-summary` (`coverage/coverage-summary.json`) y `cobertura` (`coverage/cobertura-coverage.xml`, el formato que lee el widget de cobertura de un MR de GitLab).
- **Tiempo de espera:** con la cobertura activa la suite es más lenta y algunas pruebas que recorren el repositorio pasan de los 5 s por defecto; `test:coverage` sube el límite a 30 s solo para esa corrida (`--testTimeout=30000`).

Umbrales por carpeta (`coverage.thresholds`), un poco por debajo de lo medido al activarlos para que una baja real haga fallar el CI:

| Carpeta | Líneas | Ramas | Funciones | Sentencias | Medido al activarlos (líneas / ramas / funciones) |
|---|---|---|---|---|---|
| `lib/**` | 95 | 94 | 97 | 95 | 96.5 / 95.6 / 98.1 |
| `app/api/**` | 97 | 93 | 99 | 97 | 98.6 / 94.3 / 100 |
| `app/webhook/**` | 94 | 70 | 99 | 94 | 95.5 / 71.4 / 100 |

`app/components/**` (51 % de líneas) y las páginas de `app/` (14 %) no tienen umbral: el repositorio todavía no tiene una biblioteca para probar componentes de React en un DOM. Cuando se agregue, se mide y se les pone umbral.

Si un cambio sube la cobertura, se puede subir el umbral en el mismo PR; bajarlo exige explicar por qué en el PR.

## Correrlo en local

```bash
npm audit --omit=dev --audit-level=critical && npx next typegen && npx tsc --noEmit && npx eslint lib app tests && npm run format:check && npm run test:coverage && npm run test:perf
```

## Regla de la rama `main`

Ruleset **«main: CI must pass»** (Settings → Rules → Rulesets):

- exige que el check `types, lint and tests` pase antes de fusionar;
- bloquea el force-push y el borrado de `main`;
- no exige que la rama esté al día con `main` (los PR apilados quedarían bloqueados);
- el rol de administrador puede saltarla **solo al fusionar un PR** (desvío para una emergencia, por ejemplo si GitHub Actions cae). Un push directo a `main` se rechaza.

Si el job cambia de nombre, hay que actualizar el ruleset: con un nombre que no coincide, ningún PR se puede fusionar.

## PR apilados

Un PR cuya base es otra rama (no `main`) usa el workflow que exista en su commit de fusión, así que corre el CI cuando su base pasa a `main` (el evento `edited` cubre ese cambio de base). Para fusionar una pila: fusionar el primero, reapuntar el siguiente a `main` y repetir.
