---
name: revision-be-01-arquitectura
description: Filtro 1 de 10 de revision-backend. Controlador delgado, servicios sin Request/Response, acceso a datos solo en repositorios. Úsalo solo dentro de revision-backend.
---

# Filtro BE-01 · Arquitectura (R01-R12, R163-R177, R203)

## Verifica en los archivos del alcance

- Los handlers de `app/api/**` y `app/webhook/**` solo reciben, validan lo básico y responden; la lógica está en `lib/` (R01, R02).
- Nada en `lib/` importa ni recibe `Request`/`Response`/`NextRequest`/`NextResponse`; los DTO planos son la frontera (R04).
- Prisma solo se toca desde `lib/db/` y los repositorios (`lib/establecimientos/repositorio.ts`, `lib/inbox`, etc.); ningún servicio ni paso del FSM llama al cliente directo (R03, R66). El motivo de cada SQL crudo se revisa en el filtro 7.
- Servicios externos (MINSA, Gemini, Meta) detrás de una interfaz y un adaptador en `lib/integrations/` o `lib/fsm/parsing/ai/providers/` (R06, R07). Los ejemplos de R07 y R165 vienen de un servicio con `pg` sin ORM; en el bot, el adaptador de datos es el repositorio con Prisma Client.
- Dependencias por parámetro o constructor y una sola raíz de composición que elige el adaptador real o el falso (R05, R168, R203).

## Comandos

```bash
rg -n "NextRequest|NextResponse|Request\b" lib
rg -n "prisma\.|getPrisma|PrismaClient" lib app --glob '!lib/db/**'
```

Toda coincidencia fuera de un repositorio o de `lib/db/` se justifica o es FALLA.

## Veredicto

PASA si no hay coincidencias injustificadas. FALLA lista `archivo:línea` + regla. Con FALLA no pasar al filtro 2.
Siguiente: `revision-be-02-errores-http`.
