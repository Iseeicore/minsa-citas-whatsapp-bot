---
name: revision-fe-03-datos-backend
description: Filtro 3 de 5 de revision-frontend. HTTP por un solo cliente, errores por errorCode, sesión y rol decididos por el servidor, cliente transparente con el backend. Úsalo solo dentro de revision-frontend.
---

# Filtro FE-03 · Datos y red (reglas 9-16, 60-64)

## Verifica

- Todo HTTP de la UI pasa por el cliente central; ningún `fetch` suelto que se salte cabeceras, credenciales o manejo de errores (9).
- Filtros de consulta con el helper central que descarta `undefined`/`null`/`""` (10).
- Errores del servidor leídos por `errorCode`, con `error` como respaldo; un solo extractor de mensajes para toda la app (11, 12).
- Sin secretos con prefijo `NEXT_PUBLIC_` (13); sesión no guardada en `localStorage` (14).
- Rol y sesión los decide el servidor; ocultar un botón es comodidad, no seguridad (15). Ante 401 se limpia el estado y se redirige, sin reintentos en bucle (16).
- Cliente transparente: usa la respuesta tal cual, sin deducir ni revalidar estado, sin filtrar por reglas de negocio; la respuesta se lee en un solo punto, sin cadenas `a ?? b ?? c`; ningún campo `status` a secas (60-62).
- Sin datos simulados con valor mágico (63). Si el diff quita una deducción, confirmar que el backend ya envía el dato; si no, preguntar y avisar (64).

## Comandos

```bash
rg -n "fetch\(|localStorage|sessionStorage" app
rg -n "NEXT_PUBLIC_" app lib .env.example
rg -n "\?\? *\w+(\.\w+|\?\.\w+)* *\?\?" app
```

## Veredicto

PASA / FALLA con `archivo:línea` + regla. Con FALLA no pasar al filtro 4.
Siguiente: `revision-fe-04-comentarios-mocks-formato`.
