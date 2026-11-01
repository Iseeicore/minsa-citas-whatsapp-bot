---
name: revision-fe-01-estructura-componentes
description: Filtro 1 de 5 de revision-frontend. Constantes y utilidades fuera de la vista, un solo button nativo, componentes para lo repetido, regex en su carpeta. Úsalo solo dentro de revision-frontend.
---

# Filtro FE-01 · Estructura y componentes (F01-F19, F46-F50, F88; G03, G75, G76)

## Verifica

- Estados, tipos y límites en `lib/enums/` y `lib/constants/`, no repartidos por las vistas (F01).
- Textos para el usuario según G03 enmendada y F46: un texto corto de un solo uso va **en línea** en el JSX, salvo que (1) se use dos o más veces, (2) lleve un dato que se usa dos o más veces, (3) repita un dato de negocio que ya existe (teléfono, marca), (4) otro código lo compare, derive o verifique, (5) sea un mensaje del bot en `lib/fsm`, (6) sea contenido legal o de marca, o (7) tenga más de 8 palabras. Con un motivo, constante no exportada arriba del archivo; si lo usan varios archivos, en `lib/constants/textos/`. Una constante para un texto corto de un solo uso sin motivo es FALLA.
- Del objeto que se lee varias veces se toman sus campos una sola vez, pero solo después de estrechar una unión discriminada (G75).
- Un enum se importa una sola vez y con su propio nombre, sin `as XEnum` ni un tipo unión duplicado al lado (G76).
- Un diálogo modal es `<dialog>` abierto con `showModal()`: fondo inerte, Tab encerrado, Escape por `onCancel` y el foco vuelve al control que lo abrió (F88). Un `div` con `role="dialog"` y `aria-modal` es FALLA.
- Lógica pura (cálculo, formato, filtrar, paginar) en `lib/utils/` con su prueba espejo, no dentro del componente (3, 53).
- Imports con alias `@/`, nunca relativos (4).
- Un solo `<button` nativo en toda la UI: `app/components/ui/Button`; `IconButton`, `ListPicker`, etc. se componen sobre él (52). Estructuras repetidas (campo de texto, aviso, tarjeta, avatar, estado vacío) son componentes de `app/components/ui/` (5, 6, 53).
- Markup repetido como diccionario recorrido con `map` (7).
- Regex como constantes con nombre en `lib/constants/regex/`; ninguna escrita donde se usa (57-59).

## Comandos

```bash
rg -n "<button" app --glob '!app/components/ui/Button.tsx'
rg -n "from \"\.\.?/" app
rg -n "as \w+Enum\b" app lib
rg -n 'role="dialog"|aria-modal' app
rg -n "^const [A-Z_]+_(TEXT|LABEL|HREF|ARIA_LABEL) = " app
npx vitest run tests/integration/ui-design-rules.test.ts tests/integration/regex-location.test.ts
```

## Veredicto

PASA / FALLA con `archivo:línea` + regla. Con FALLA no pasar al filtro 2.
Siguiente: `revision-fe-02-estilos`.
