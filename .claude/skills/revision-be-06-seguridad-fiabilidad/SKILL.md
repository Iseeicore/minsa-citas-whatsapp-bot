---
name: revision-be-06-seguridad-fiabilidad
description: Filtro 6 de 10 de revision-backend. Rutas públicas exactas, webhooks con HMAC, secretos sin prefijo público, logs sin datos sensibles, timeouts y rate limit. Úsalo solo dentro de revision-backend.
---

# Filtro BE-06 · Seguridad y fiabilidad (reglas 29-42, 100)

## Verifica

- Listas blancas de rutas públicas con coincidencia exacta, nunca por prefijo (29).
- Webhooks verifican firma HMAC con `timingSafeEqual` (34). La bandeja y el sandbox respetan sus banderas (`SANDBOX_PAGE_ENABLED`, `SANDBOX_ENABLED`) y no abren superficie sin autenticación sin decirlo (100).
- Ningún secreto con prefijo `NEXT_PUBLIC_` (35); sin credenciales ni cadenas de conexión en código, README o logs (24).
- Logs no registran tokens, contraseñas ni datos sensibles (36); logs estructurados con nivel y contexto, el error real solo ahí (40).
- Rate limit en endpoints públicos (37). Llamadas externas con timeout y reintentos acotados (39). Toda excepción llega al manejador global (38).
- Conexiones de larga duración con heartbeat y tope (41, [G]) y entorno de despliegue compatible (42, [G]).
- Rol/estado validados en el servidor en cada petición protegida; el cliente nunca decide permisos (32, 33).

## Comandos

```bash
rg -n "NEXT_PUBLIC_" app lib .env.example
rg -n "startsWith\(\"/" lib/security app
rg -n "fetch\(" lib/integrations lib/whatsapp | rg -v "signal|timeout"
npx vitest run tests/security
```

## Veredicto

PASA solo si `tests/security` pasa y las coincidencias están justificadas. FALLA con `archivo:línea` + regla. Con FALLA no pasar al filtro 7.
Siguiente: `revision-be-07-datos-migraciones`.
