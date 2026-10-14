---
name: revision-be-02-errores-http
description: Filtro 2 de 10 de revision-backend. Formato único de error, errorCode desde enum, códigos HTTP semánticos, sin trazas al cliente. Úsalo solo dentro de revision-backend.
---

# Filtro BE-02 · Errores y códigos HTTP (reglas 7-13)

## Verifica

- Toda respuesta de error usa `apiError` (`lib/http/`) con el formato `{ error, errorCode, statusCode, detalles?, timestamp, path }`; cambios al formato son solo aditivos (regla 12).
- Todo `errorCode` sale de `lib/enums/api-error-code.ts`; ningún código escrito como texto.
- Códigos HTTP según la tabla de la regla 13; nunca un 200 con error en el cuerpo; 500 con mensaje genérico.
- Ningún `catch` en un handler que arme su propia respuesta de error ad hoc; no se filtran trazas ni errores crudos de Prisma al cliente.

## Comandos

```bash
rg -n "status: (4|5)\d\d|NextResponse\.json\(\{ ?error" app
rg -n "\.stack|error\.message" app
```

Cada coincidencia debe pasar por `apiError` o justificarse.

## Veredicto

PASA / FALLA con `archivo:línea` + regla. Con FALLA no pasar al filtro 3.
Siguiente: `revision-be-03-validacion-datos-externos`.
