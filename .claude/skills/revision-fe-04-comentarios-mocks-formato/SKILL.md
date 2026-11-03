---
name: revision-fe-04-comentarios-mocks-formato
description: Filtro 4 de 5 de revision-frontend. Cero comentarios o docstrings, sin mocks ni datos de demostración en producción, código formateado. Úsalo solo dentro de revision-frontend.
---

# Filtro FE-04 · Comentarios, mocks y formato (F30, F50, F61)

## Verifica

- Ningún comentario ni docstring en componentes, pruebas ni configuración; solo directivas de herramienta (F50).
- Sin mocks ni datos simulados activados por un valor mágico en el código de producción; los datos de demostración viven fuera de él (F30).
- El formato lo decide la herramienta (F61). `app/` aún no está cubierto por Prettier (`.prettierignore`): no se reformatea lo ajeno al cambio.

## Comandos

```bash
rg -n "^\s*(//|/\*|\{/\*)" app tests/app | rg -v "eslint-disable|@ts-"
rg -n "mock|fixture|dummy" app
```

## Veredicto

PASA / FALLA con `archivo:línea` + regla. Con FALLA no pasar al filtro 5.
Siguiente: `revision-fe-05-entrega`.
