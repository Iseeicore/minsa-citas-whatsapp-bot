---
name: revision-fe-03-datos-backend
description: Filtro 3 de 5 de revision-frontend. HTTP por un solo cliente con un solo enum de estado, errores por errorCode, sesión y rol decididos por el servidor, cliente transparente con el backend. Úsalo solo dentro de revision-frontend.
---

# Filtro FE-03 · Datos y red (F20-F34, F77-F78, F87; G11, G46, G47)

## Verifica

- Toda petición HTTP del frontend pasa por `lib/http/api-client.ts`, con un solo enum de estado de la petición (`ApiRequestStatus`); `fetch(` solo aparece en ese cliente (F22, F68). Única excepción: el aviso `keepalive` de `closePreviousConversation` en `app/components/sandbox-chat/browser.ts`, que no espera respuesta. Un `fetch` suelto en otro lugar es FALLA aunque maneje sus errores.
- Los hooks viven en `app/hooks/`, la única carpeta de hooks. Varios hooks están bien si hacen cosas distintas (una petición, una paginación, un sondeo), pero todos usan el mismo transporte (F18, F22). Un segundo enum de estado de la petición es FALLA.
- Cada petición tiene cuatro estados (`IDLE`, `LOADING`, `ERROR`, `DATA`) en `ApiState<T>`, discriminado por `status`, y cada uno tiene una salida visible y su prueba (F87, G47). Ningún `catch` hace desaparecer la falla (G46). Una lectura atada a una vista cancela o ignora la respuesta vencida, y nada pesado corre en el render (F20, F21).
- Filtros de consulta con el helper central que descarta `undefined`, `null` y `""` (F23).
- Errores del servidor leídos por `errorCode`, con `error` como respaldo; un solo extractor de mensajes para toda la app (F24, F25).
- Sin secretos con prefijo `NEXT_PUBLIC_` (F31); sesión no guardada en `localStorage` (F32).
- Rol y sesión los decide el servidor; ocultar un botón es comodidad, no seguridad (F33). Ante 401 se limpia el estado y se redirige, sin reintentos en bucle (F34, G11).
- Cliente transparente: usa la respuesta tal cual, sin deducir ni revalidar estado, sin filtrar por reglas de negocio (F26); la respuesta se lee en un solo punto, sin cadenas `a ?? b ?? c` (F27); ningún campo `status` a secas en un contrato con otro servicio, aunque el discriminante de una unión local tipado con un enum sí puede llamarse `status` (F28).
- Sin datos simulados con valor mágico (F30). Si el diff quita una deducción, confirmar que el backend ya envía el dato; si no, preguntar y avisar (F29).

## Comandos

```bash
rg -n "fetch\(" app lib/http --glob '!lib/http/api-client.ts'
rg -n "Status\b" lib/enums | rg -i "request|fetch"
rg --files app | rg "/hooks/" | rg -v "^app[/\\\\]hooks[/\\\\]"
rg -n "localStorage|sessionStorage" app
rg -n "NEXT_PUBLIC_" app lib .env.example
rg -n "\?\? *\w+(\.\w+|\?\.\w+)* *\?\?" app
```

La única coincidencia aceptada de la primera búsqueda es `app/components/sandbox-chat/browser.ts` con `keepalive: true`.

## Veredicto

PASA / FALLA con `archivo:línea` + regla. Con FALLA no pasar al filtro 4.
Siguiente: `revision-fe-04-comentarios-mocks-formato`.
