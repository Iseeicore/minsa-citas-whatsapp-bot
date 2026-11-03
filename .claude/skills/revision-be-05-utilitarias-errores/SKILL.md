---
name: revision-be-05-utilitarias-errores
description: Filtro 5 de 10 de revision-backend. Utilitarias con nombre para gestos repetidos, clases de error propias en lib/errors, catch que no esconde fallas. Úsalo solo dentro de revision-backend.
---

# Filtro BE-05 · Utilitarias y errores propios (R52-R66; R20-R23; G45-G47)

## Verifica

- Gestos repetidos (`String(x ?? "")`, `typeof x === "string"`, lectura de JSON) usan las utilitarias de `lib/utils/` (`isString`, `stringOr`, `toText`, `parseJsonOr`…), con pruebas; las de tipo son predicados `value is T` (R53, R54).
- Un gesto que se repite es una función con nombre y con pruebas (R54). La repetición se mide en el repo con `rg`, no se supone. Los segundos Unix se calculan con `toUnixSeconds` y `fromUnixSeconds` de `lib/time/epoch-seconds.ts`, y las duraciones con `lib/constants/limits/time-units.ts`.
- La lógica pura sale a `lib/utils/` solo si la usan dos o más archivos o tiene lógica propia que vale probar aparte; un ternario o una línea de un solo consumidor se queda donde se usa (R62).
- Antes de reemplazar por una utilitaria existente se demostró que hace exactamente lo mismo (R124). Solo existen utilitarias que el código usa (R64).
- Ningún `throw new Error(` genérico: cada falla tiene su clase en `lib/errors/`, una por archivo, con los datos como campos y el mensaje armado adentro (R20).
- Errores reconocidos por `instanceof` o por código de tercero (`P2002`), nunca por texto del mensaje (R21). Un resultado no se convierte en excepción (R22).
- Ningún `catch` vacío o que trague el error sin rastro, salvo el descarte a propósito con una función con nombre y su prueba (R23, G46). Lo que puede fallar, faltar o estar en curso es una unión discriminada por un enum (G47). Cada función lee, decide y produce, sin ternarios anidados (G45).

## Comandos

```bash
npx vitest run tests/integration/utilidades-location.test.ts tests/integration/errores-location.test.ts
rg -n "throw new Error\(" lib app
rg -n "catch *(\(\w*\))? *\{ *\}" lib app
rg -n "String\(\w+ \?\? \"\"\)|typeof \w+(\.\w+)* === \"string\"" lib
rg -n "getTime\(\) / 1000|Date\.now\(\) / 1000" lib app
```

## Veredicto

PASA solo si las pruebas pasan y `rg` no deja coincidencias injustificadas. FALLA con `archivo:línea` + regla. Con FALLA no pasar al filtro 6.
Siguiente: `revision-be-06-seguridad-fiabilidad`.
