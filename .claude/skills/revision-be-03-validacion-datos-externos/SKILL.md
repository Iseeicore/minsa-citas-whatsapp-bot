---
name: revision-be-03-validacion-datos-externos
description: Filtro 3 de 10 de revision-backend. Validación con esquema (zod) en la frontera, paginación con tope, y clientes transparentes con datos de otros servicios. Úsalo solo dentro de revision-backend.
---

# Filtro BE-03 · Validación y datos externos (R25-R37, R128; G09-G11)

## Verifica

- Body, params y query se validan con un esquema zod antes de llegar al servicio; los identificadores (UUID, enteros) se validan antes de consultar (R25, R26, R29).
- Paginación con un helper único y tope máximo; filtros armados con un helper que descarta `undefined`/`null`/`""` (R27, R28).
- Los clientes de `lib/integrations/` son transparentes: usan lo que envía el servicio tal cual, sin deducir estado por la presencia de filas, sin revalidar un estado ya recibido, sin filtrar por reglas de negocio (R31).
- La respuesta externa se lee en **un solo punto** (la frontera); sin cadenas `a ?? b ?? c` sobre campos alternativos (R30).
- Ningún campo de un contrato con otro servicio se llama `status` a secas; el discriminante de una unión local tipado con un enum sí puede llamarse `status` (R32). Sin datos simulados activados por un valor mágico (R33).
- Si el diff quita una deducción del cliente: confirmado que el servicio ya envía el dato y avisado al otro equipo (R31). Si no se puede confirmar, preguntar.
- Un valor que decide otro sistema se lee de él y, si falla, se omite (G09). Ningún 4xx se reintenta en bucle (G11).

## Comandos

```bash
rg -n "\?\? *\w+(\.\w+|\?\.\w+)* *\?\?" lib/integrations
rg -n "\bstatus\b *[:=]" lib/integrations
```

## Veredicto

PASA / FALLA con `archivo:línea` + regla. Con FALLA no pasar al filtro 4.
Siguiente: `revision-be-04-constantes`.
