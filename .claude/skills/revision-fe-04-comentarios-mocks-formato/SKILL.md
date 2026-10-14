---
name: revision-fe-04-comentarios-mocks-formato
description: Filtro 4 de 5 de revision-frontend. Cero comentarios o docstrings, sin mocks ni datos de demostración en producción, código formateado. Úsalo solo dentro de revision-frontend.
---

# Filtro FE-04 · Comentarios, mocks y formato (reglas 22-27, 65)

## Verifica

- Ningún comentario ni docstring en componentes, pruebas ni configuración; solo directivas de herramienta (22-25, 65).
- Mocks no commiteados; si hace falta uno, va detrás de un flag de entorno local y se quita antes de subir (26). Datos de demostración fuera del código de producción (27); el flujo `demo/` del piloto está marcado para borrarse junto con su importador.
- El código tocado queda ordenado y legible (componentes, clases, funciones). `app/` aún no está cubierto por Prettier (`.prettierignore`): no se reformatea lo ajeno al cambio (regla BE 104).

## Comandos

```bash
rg -n "^\s*(//|/\*|\{/\*)" app tests/app | rg -v "eslint-disable|@ts-"
rg -n "mock|fixture|dummy" app
```

## Veredicto

PASA / FALLA con `archivo:línea` + regla. Con FALLA no pasar al filtro 5.
Siguiente: `revision-fe-05-entrega`.
