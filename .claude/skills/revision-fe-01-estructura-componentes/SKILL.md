---
name: revision-fe-01-estructura-componentes
description: Filtro 1 de 5 de revision-frontend. Constantes y utilidades solo cuando cumplen el umbral, un solo button nativo, componentes para lo repetido, títulos, HTML semántico, diálogos y regex en su carpeta. Úsalo solo dentro de revision-frontend.
---

# Filtro FE-01 · Estructura y componentes (F01-F10, F15-F19, F46-F50, F88-F90; G03, G04, G05, G75, G76, R44)

Antes de dictaminar G03, G04, F01, F02 y F46, leer la regla vigente en el vault. Este archivo no copia su texto.

## Verifica

- Estados y claves son enums de `lib/enums/` (F09, G05). Límites y configuración son constantes con nombre (G03). Un identificador técnico u otro valor sale a una constante solo si lo usan dos o más archivos o es un contrato entre quien lo escribe y quien lo lee (G04, F01); con un solo uso y sin contrato va en línea. Una constante es un valor: sin derivadas, envoltorios ni alias que solo renombran (G04, R44). Lo existente se reutiliza solo si cumple la regla vigente.
- Textos para el usuario según G03 y F46: de un solo uso van en línea salvo que cumplan uno de los siete motivos de G03; en `app/` la longitud no es motivo. Una constante de texto de un solo uso sin motivo es FALLA.
- Lógica pura a `lib/utils/` con su prueba espejo solo si la usan dos o más archivos o tiene lógica propia que vale probar aparte; un ternario o una línea de un solo consumidor se queda donde se usa (F02).
- Tipos de respuesta y de dominio en `lib/types/<tema>.types.ts`, no en línea en el componente (F19).
- Del objeto que se lee varias veces se toman sus campos una sola vez, después de estrechar la unión discriminada (G75). Un enum se importa una sola vez y con su propio nombre, sin `as XEnum` ni una unión duplicada al lado (G76).
- Imports con alias `@/`, nunca relativos (F03, G02).
- Un solo `<button` nativo: `app/components/ui/Button`; `IconButton`, `ListPicker` y los demás se componen sobre él (F10). Estructuras repetidas (campo, aviso, tarjeta, avatar, estado vacío, título) son componentes de `app/components/ui/` (F04, F05).
- Un diálogo modal compone `Dialog` (el único `<dialog>`, abierto con `showModal()`), directamente o con `Modal`: fondo inerte, Tab encerrado, Escape por `onCancel` y el foco vuelve al control que lo abrió. Un `div` con `role="dialog"`, `role="alertdialog"` o `aria-modal` es FALLA (F88).
- Los títulos usan `Heading` (`app/components/ui/Heading.tsx`) con `level` semántico y `variant` visual; el nivel lo da la estructura, nunca el tamaño. Un `<h1>` a `<h6>` fuera de `Heading` es FALLA (F89), salvo las excepciones declaradas: el héroe de la landing (`app/components/landing/LandingHero.tsx`) y `app/global-error.tsx`, que arma su propio `html`. Lo comprueba `tests/integration/ui-design-rules.test.ts`.
- Regex como constantes con nombre en `lib/constants/regex/`; ninguna escrita donde se usa (F47, F48, F49).
- **Sin herramienta, revisado a mano:** tres o más elementos con la misma forma salen de un arreglo con `map`, salvo componentes o props distintos (F06); los pares de etiqueta y valor fuera de un botón o un enlace van en `<dl>`, y dentro de `<button>` o `<a>` solo `<span>` (F90). Cada una se informa como `no verificable con herramienta — revisado a mano: sí/no`.

## Comandos

```bash
rg -n "<button" app --glob '!app/components/ui/Button.tsx'
rg -n "from \"\.\.?/" app
rg -n "as \w+Enum\b" app lib
rg -n 'role="(alert)?dialog"|aria-modal' app --glob '!app/components/ui/Dialog.tsx'
rg -n "^(export )?const [A-Z][A-Z0-9_]*_(TEXT|LABEL|HREF|ARIA_LABEL|ALT_TEXT|ATTRIBUTE|CLASS_NAME) = " app lib/constants
rg -n "^(export )?const [A-Z][A-Z0-9_]* = [A-Za-z_][A-Za-z0-9_.]*;$" app lib
rg -n "<(div|p|h[1-6]|dl)\b" app | rg -i "button|<a "
npx vitest run tests/integration/ui-design-rules.test.ts tests/integration/regex-location.test.ts
```

Las dos búsquedas de `const` dan candidatos: cada uno se cuenta en el repo (`rg -c NOMBRE app lib`). Con un solo uso y sin motivo de G03 ni contrato de G04, o si solo renombra otro valor (R44), es FALLA, salvo constantes de clases de F11 y F13: un `*_CLASS_NAME` del propio componente es local y con un solo uso no es hallazgo (F01).

## Veredicto

PASA / FALLA con `archivo:línea` + regla, más el estado de F06 y F90. Con FALLA no pasar al filtro 2.
Siguiente: `revision-fe-02-estilos`.
