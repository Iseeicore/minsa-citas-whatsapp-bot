# CI (GitHub Actions)

Archivo: `.github/workflows/ci.yml`. Corre en cada pull request y en cada push a `main`.

## Qué comprueba

Un solo job, `types, lint and tests`, en Ubuntu con Node 22:

1. `npm ci` (con un `DATABASE_URL` de relleno **solo en este paso**: `prisma generate` necesita el esquema; con esa variable presente durante las pruebas la app conectaría el candado de Postgres e intentaría abrir una conexión).
2. `npx next typegen`: Next genera los tipos globales de rutas (`LayoutProps`, `PageProps`…) y en un checkout limpio no existen hasta que esto corre.
3. `npx tsc --noEmit`
4. `npx eslint lib app tests`
5. `npx vitest run`

No necesita secretos: las pruebas usan almacenes en memoria y adaptadores fake. No corre `next build`: Vercel ya compila cada PR y el build necesita variables de entorno.

## Correrlo en local

```bash
npx next typegen && npx tsc --noEmit && npx eslint lib app tests && npx vitest run
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
