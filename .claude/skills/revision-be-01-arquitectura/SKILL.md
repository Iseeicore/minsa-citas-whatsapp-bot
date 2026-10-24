---
name: revision-be-01-arquitectura
description: Filtro 1 de 10 de revision-backend. Controlador delgado, servicios sin Request/Response, acceso a datos solo en repositorios. Úsalo solo dentro de revision-backend.
---

# Filtro BE-01 · Arquitectura (reglas 1-6, 52)

## Verifica en los archivos del alcance

- Los handlers de `app/api/**` y `app/webhook/**` solo reciben, validan lo básico y responden; la lógica está en `lib/`.
- Nada en `lib/` importa ni recibe `Request`/`Response`/`NextRequest`/`NextResponse` (los DTO planos son la frontera).
- Prisma solo se toca desde `lib/db/` y los repositorios (`lib/establecimientos/repositorio.ts`, `lib/inbox`, etc.); ningún servicio ni paso del FSM llama al cliente directo.
- Servicios externos (MINSA, Gemini, Meta) detrás de una interfaz/adaptador en `lib/integrations/` o `lib/fsm/parsing/ai/providers/`.

## Comandos

```bash
rg -n "NextRequest|NextResponse|Request\b" lib
rg -n "prisma\.|getPrisma|PrismaClient" lib app --glob '!lib/db/**'
```

Toda coincidencia fuera de un repositorio o de `lib/db/` se justifica o es FALLA.

## Veredicto

PASA si no hay coincidencias injustificadas. FALLA lista `archivo:línea` + regla. Con FALLA no pasar al filtro 2.
Siguiente: `revision-be-02-errores-http`.
