---
name: revision-be-05-utilitarias-errores
description: Filtro 5 de 10 de revision-backend. Utilitarias con nombre para gestos repetidos, clases de error propias en lib/errors, catch que no esconde fallas. Úsalo solo dentro de revision-backend.
---

# Filtro BE-05 · Utilitarias y errores propios (reglas 77-87)

## Verifica

- Gestos repetidos (`String(x ?? "")`, `typeof x === "string"`, lectura de JSON) usan las utilitarias de `lib/utils/` (`isString`, `stringOr`, `toText`, `parseJsonOr`…), con pruebas; las de tipo son predicados `value is T` (77, 78).
- Antes de reemplazar por una utilitaria existente se comprobó que hace exactamente lo mismo (79). Lectores tipados junto al tipo que leen (80). Solo existen utilitarias que el código usa (81).
- Ningún `throw new Error(` genérico: cada falla tiene su clase en `lib/errors/` (una por archivo, datos como campos, mensaje armado adentro, mensaje idéntico al anterior) (82-84).
- Errores reconocidos por `instanceof` o por código de tercero (`P2002`), nunca por texto del mensaje (85). Un resultado no se convierte en excepción (86).
- Ningún `catch` vacío o que trague el error sin rastro, salvo intencional y con prueba (87).

## Comandos

```bash
npx vitest run tests/integration/utilidades-location.test.ts tests/integration/errores-location.test.ts
rg -n "throw new Error\(" lib app
rg -n "catch *(\(\w*\))? *\{ *\}" lib app
rg -n "String\(\w+ \?\? \"\"\)|typeof \w+(\.\w+)* === \"string\"" lib
```

## Veredicto

PASA solo si las pruebas pasan y `rg` no deja coincidencias injustificadas. FALLA con `archivo:línea` + regla. Con FALLA no pasar al filtro 6.
Siguiente: `revision-be-06-seguridad-fiabilidad`.
