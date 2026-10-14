---
name: revision-be-03-validacion-datos-externos
description: Filtro 3 de 10 de revision-backend. Validación con esquema (zod) en la frontera, paginación con tope, y clientes transparentes con datos de otros servicios. Úsalo solo dentro de revision-backend.
---

# Filtro BE-03 · Validación y datos externos (reglas 14-17, 88-92)

## Verifica

- Body, params y query se validan con un esquema zod antes de llegar al servicio; los identificadores (UUID, enteros) se validan antes de consultar.
- Paginación con un helper único y tope máximo; filtros armados con un helper que descarta `undefined`/`null`/`""`.
- Los clientes de `lib/integrations/` son transparentes: usan lo que envía el servicio tal cual, sin deducir estado por la presencia de filas, sin revalidar un estado ya recibido, sin filtrar por reglas de negocio (88).
- La respuesta externa se lee en **un solo punto** (la frontera); sin cadenas `a ?? b ?? c` sobre campos alternativos (89).
- Ningún campo llamado `status` a secas (90); sin datos simulados activados por un valor mágico (91).
- Si el diff quita una deducción del cliente: confirmado que el servicio ya envía el dato y avisado al otro equipo (92). Si no se puede confirmar, preguntar.

## Comandos

```bash
rg -n "\?\? *\w+(\.\w+|\?\.\w+)* *\?\?" lib/integrations
rg -n "\bstatus\b *[:=]" lib/integrations
```

## Veredicto

PASA / FALLA con `archivo:línea` + regla. Con FALLA no pasar al filtro 4.
Siguiente: `revision-be-04-constantes`.
