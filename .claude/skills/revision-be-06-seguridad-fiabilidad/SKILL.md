---
name: revision-be-06-seguridad-fiabilidad
description: Filtro 6 de 10 de revision-backend. Rutas públicas exactas, webhooks con HMAC, secretos sin prefijo público, logs sin datos sensibles, timeouts y rate limit. Úsalo solo dentro de revision-backend.
---

# Filtro BE-06 · Seguridad y fiabilidad (R84-R100, R140-R142, R158-R161, R190, R199-R200)

## Verifica

- Listas blancas de rutas públicas con coincidencia exacta, nunca por prefijo (R84).
- Webhooks verifican firma HMAC con `timingSafeEqual` (R89). La bandeja y el sandbox respetan sus banderas (`SANDBOX_PAGE_ENABLED`, `SANDBOX_ENABLED`); una variable que abre una superficie sin autenticación se pide a infraestructura con su riesgo dicho (R93).
- Ningún secreto con prefijo `NEXT_PUBLIC_` (R90); sin credenciales ni cadenas de conexión en código, README o logs (R91).
- Logs estructurados con nivel y contexto, sin tokens ni datos sensibles; el nivel lo decide el significado y el nombre del evento sale del catálogo (R98, R199, R200).
- Rate limit en endpoints públicos (R92). Llamadas externas con timeout y reintentos acotados, solo para fallos transitorios (R95, R96). Toda excepción llega al manejador global (R94).
- Conexiones de larga duración con heartbeat y tope (R99, [G]) y entorno de despliegue compatible (R100, [G]).
- Rol y estado validados en el servidor en cada petición protegida; el cliente nunca decide permisos (R88, R159).

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
