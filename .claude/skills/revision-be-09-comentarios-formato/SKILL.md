---
name: revision-be-09-comentarios-formato
description: Filtro 9 de 10 de revision-backend. Cero comentarios o docstrings en todo archivo, código muerto fuera, formato Prettier, finales de línea. Úsalo solo dentro de revision-backend.
---

# Filtro BE-09 · Comentarios y formato (R101-R104, R143-R144, R198; R63-R65, R106, R113-R114, R137)

## Verifica

- Ningún comentario ni docstring en código, pruebas, migraciones SQL, semillas ni `schema.prisma`; solo directivas de herramienta (`eslint-disable`) (R101, R143). El inventario se confirma con el analizador del lenguaje (R144). Una migración ya aplicada no se toca, ni para quitarle comentarios (R77).
- Sin código muerto (R64); imports con alias `@/` (R65); bloques repetidos como mapa o helper (R63).
- Código sin cobertura que se toca tiene antes su prueba de caracterización (R106).
- Formato por Prettier, sin reordenar clases ni tocar contenido de textos; solo se formatea lo del cambio (R113).
- Sin cambio espurio de finales de línea (R113).

## Comandos

```bash
rg -n "^\s*(//|/\*|\*)" lib app tests scripts --glob '!*.json' | rg -v "eslint-disable|@ts-"
rg -n "^\s*--" prisma/migrations prisma/tests
npm run format:check
git diff --shortstat <destino>...HEAD; git diff --shortstat --ignore-cr-at-eol <destino>...HEAD
```

Los dos `--shortstat` deben coincidir. Las cabeceras de bloque como `<!-- ... -->` ajenas (AGENTS.md) no cuentan.

## Veredicto

PASA si no hay comentarios, `format:check` pasa y los `--shortstat` coinciden. FALLA con `archivo:línea` + regla. Con FALLA no pasar al filtro 10.
Siguiente: `revision-be-10-git-entrega`.
