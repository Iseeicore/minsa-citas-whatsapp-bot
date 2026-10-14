---
name: revision-be-09-comentarios-formato
description: Filtro 9 de 10 de revision-backend. Cero comentarios o docstrings en todo archivo, código muerto fuera, formato Prettier, finales de línea. Úsalo solo dentro de revision-backend.
---

# Filtro BE-09 · Comentarios y formato (reglas 43-51, 64, 102-110)

## Verifica

- Ningún comentario ni docstring en código, pruebas, migraciones SQL, semillas ni `schema.prisma`; solo directivas de herramienta (`eslint-disable`) (43-47, 64).
- Sin código muerto (51); imports con alias `@/` (49); bloques repetidos como mapa/helper (50).
- Código sin cobertura que se toca tiene antes su prueba de caracterización (53).
- Formato por Prettier, sin reordenar clases ni tocar contenido de textos; solo se formatea lo del cambio (102-105).
- Sin cambio espurio de finales de línea (106).

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
