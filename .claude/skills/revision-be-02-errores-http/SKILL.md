---
name: revision-be-02-errores-http
description: Filtro 2 de 10 de revision-backend. Formato único de error, errorCode desde enum, códigos HTTP semánticos con el enum HttpStatus, sin trazas al cliente. Úsalo solo dentro de revision-backend.
---

# Filtro BE-02 · Errores y códigos HTTP (R13-R24, R196; R42)

## Verifica

- Toda respuesta de error usa `apiError` (`lib/http/api-error.ts`); cambios al formato son solo aditivos. El formato completo de R17 (`statusCode`, `timestamp`, `path`) y el manejador global (R14) siguen pendientes: anotarlos, no corregirlos de paso.
- Todo `errorCode` sale de `lib/enums/api-error-code.ts`; ningún código escrito como texto.
- Códigos HTTP según la tabla de la sección 2; nunca un 200 con error en el cuerpo; 500 con mensaje genérico.
- Todo código HTTP se escribe con el enum `HttpStatus` de `lib/enums/http-status.ts` (R42): ningún número 100-599 como `status:`, comparado con `.status`, en una lista usada con `.status` ni en una constante propia. Lo hace cumplir `tests/integration/http-status-location.test.ts`. Las pruebas sí escriben el número: es el contrato.
- `HttpStatus` no se importa en `lib/fsm/**` ni en servicios: el código HTTP se asigna en la frontera (R13). ESLint lo prohíbe en `lib/fsm/**`.
- Ningún `catch` en un handler que arme su propia respuesta de error ad hoc; no se filtran trazas ni errores crudos de Prisma al cliente.

## Comandos

```bash
rg -n "status:\s*[1-5]\d\d\b" app lib
rg -n "NextResponse\.json\(\{ ?error" app
rg -n "\.stack|error\.message" app
npx vitest run tests/integration/http-status-location.test.ts
```

Cada coincidencia debe pasar por `apiError` o `HttpStatus`, o justificarse.

## Veredicto

PASA / FALLA con `archivo:línea` + regla. Con FALLA no pasar al filtro 3.
Siguiente: `revision-be-03-validacion-datos-externos`.
