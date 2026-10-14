---
name: revision-fe-01-estructura-componentes
description: Filtro 1 de 5 de revision-frontend. Constantes y utilidades fuera de la vista, un solo button nativo, componentes para lo repetido, regex en su carpeta. Úsalo solo dentro de revision-frontend.
---

# Filtro FE-01 · Estructura y componentes (reglas 1-8, 52, 53, 57-59)

## Verifica

- Estados, tipos, mensajes y límites en `lib/enums/` y `lib/constants/`, no repartidos por las vistas (1, 2).
- Lógica pura (cálculo, formato, filtrar, paginar) en `lib/utils/` con su prueba espejo, no dentro del componente (3, 53).
- Imports con alias `@/`, nunca relativos (4).
- Un solo `<button` nativo en toda la UI: `app/components/ui/Button`; `IconButton`, `ListPicker`, etc. se componen sobre él (52). Estructuras repetidas (campo de texto, aviso, tarjeta, avatar, estado vacío) son componentes de `app/components/ui/` (5, 6, 53).
- Markup repetido como diccionario recorrido con `map` (7).
- Regex como constantes con nombre en `lib/constants/regex/`; ninguna escrita donde se usa (57-59).

## Comandos

```bash
rg -n "<button" app --glob '!app/components/ui/Button.tsx'
rg -n "from \"\.\.?/" app
npx vitest run tests/integration/ui-design-rules.test.ts tests/integration/regex-location.test.ts
```

## Veredicto

PASA / FALLA con `archivo:línea` + regla. Con FALLA no pasar al filtro 2.
Siguiente: `revision-fe-02-estilos`.
