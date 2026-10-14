---
name: revision-be-07-datos-migraciones
description: Filtro 7 de 10 de revision-backend. Transacciones, N+1, consultas parametrizadas, migraciones nuevas nunca editadas y probadas con datos. Úsalo solo dentro de revision-backend.
---

# Filtro BE-07 · Datos y migraciones (reglas 25-28, 93-99, 101)

## Verifica

- Escrituras relacionadas en una transacción (25); sin consultas dentro de `for`/`map` (26); SQL siempre parametrizado, sin concatenar entrada del usuario (28).
- Ninguna migración ya aplicada fue editada: `git diff --stat <destino>...HEAD -- prisma/migrations` solo muestra carpetas **nuevas** (27, 93). Si hubo que corregir una ya aplicada, se hizo con migración puente idempotente (94).
- Toda tabla/columna nueva con `COMMENT ON` (diccionario regenerado con `npm run db:diccionario`) y su prueba SQL en `prisma/tests/` que falla al apagar la regla.
- Una migración que mueve datos se detiene con error claro si no puede convertir; no inventa valores; la decisión es del responsable (98).
- Datos que las migraciones no cargan (p. ej. padrón de establecimientos) quedan escritos como requisito de despliegue (96).
- Orden de entrega: la base va antes que el código que la usa (101); se sabe qué dispara el despliegue antes de fusionar (99).

## Comandos

```bash
git diff --name-status <destino>...HEAD -- prisma/migrations
rg -n "\$queryRawUnsafe|\$executeRawUnsafe" lib app
npm run db:test
npm run smoke:postgres
```

`db:test` y `smoke:postgres` requieren PostgreSQL y `DATABASE_URL`; si no hay entorno, declararlo como "no verificado", nunca PASA implícito (97).

## Veredicto

PASA / FALLA con `archivo:línea` + regla. Con FALLA no pasar al filtro 8.
Siguiente: `revision-be-08-banderas-entorno`.
