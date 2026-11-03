---
name: revision-be-07-datos-migraciones
description: Filtro 7 de 10 de revision-backend. Prisma Client antes que SQL crudo, transacciones, N+1, consultas parametrizadas, migraciones nuevas nunca editadas y probadas con datos. Úsalo solo dentro de revision-backend.
---

# Filtro BE-07 · Datos y migraciones (R03, R70-R83, R132-R139, R178-R189, R191, R204)

## Verifica

- Una lectura o escritura simple usa Prisma Client (`count`, `findFirst`, `findMany`, `updateMany`, `aggregate`). `$queryRaw` y `$executeRaw` solo para candados consultivos, `FOR UPDATE`, `UPDATE … LIMIT … RETURNING`, la llamada a una función de la base, `set_config` o `pg_trgm`, con el motivo en el nombre del método del repositorio (R03). Un conteo o una lectura simple en SQL crudo es FALLA.
- Escrituras relacionadas en una transacción (R74); sin consultas dentro de `for`/`map` (R75); SQL siempre parametrizado, sin concatenar entrada del usuario (R76).
- Ninguna migración ya aplicada fue editada: `git diff --name-status <destino>...HEAD -- prisma/migrations` solo muestra carpetas **nuevas** (R77). Si hubo que corregir una ya aplicada, se hizo con una migración puente idempotente (R78, R134).
- Las migraciones llevan solo estructura; funciones y disparadores en `prisma/sql/` y semillas en `prisma/seeds/` (R181, R182, R184).
- Toda tabla o columna nueva lleva su `COMMENT ON` en `prisma/sql/comentarios.sql` (única fuente, editada a mano; nada aplicado en el arranque depende de `docs/`; no hay diccionario en Markdown) y su prueba SQL en `prisma/tests/` que falla al apagar la regla (R204).
- Una migración que mueve datos se detiene con error claro si no puede convertir; no inventa valores; la decisión es del responsable (R81).
- Datos que las migraciones no cargan (por ejemplo, el padrón de establecimientos) quedan escritos como requisito de despliegue (R80).
- Un servicio que lee el esquema de otro no se fusiona si depende de un objeto que ninguna migración crea (R138).

## Comandos

```bash
git diff --name-status <destino>...HEAD -- prisma/migrations
rg -n '[$](queryRaw|executeRaw)(Unsafe)?' lib app
npm run db:test
npm run smoke:postgres
```

Cada coincidencia de la segunda búsqueda se etiqueta con su caso de R03 (candado, `FOR UPDATE`, `UPDATE … LIMIT … RETURNING`, función de la base, `set_config` o `pg_trgm`); la que no tiene caso es FALLA, y una `Unsafe` con datos de entrada también lo es (R76).

`db:test` y `smoke:postgres` requieren PostgreSQL y `DATABASE_URL`; si no hay entorno, declararlo como «no verificado», nunca PASA implícito (R111).

## Veredicto

PASA / FALLA con `archivo:línea` + regla. Con FALLA no pasar al filtro 8.
Siguiente: `revision-be-08-banderas-entorno`.
