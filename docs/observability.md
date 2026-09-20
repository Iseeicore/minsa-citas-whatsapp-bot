# Observabilidad: logs por turno con `traceId`

Cada mensaje del ciudadano deja **una línea de JSON por evento** (NDJSON) que se puede seguir de punta a punta con un solo `traceId`. No hay dependencias nuevas: es `JSON.stringify` más `console`, así que no espera a nada.

## Dónde quedan los logs

| Destino | Cuándo | Detalle |
|---|---|---|
| **stdout** (Vercel Logs o la terminal) | Siempre | `info` sale por `console.info`, `warn` por `console.warn` y `error` por `console.error`, así Vercel muestra la severidad correcta. |
| **Carpeta por día** | Con `LOG_TO_FILE=true` | `logs/19-09-2026/app.ndjson` (todo) y `logs/19-09-2026/alerts.ndjson` (solo `warn` y `error`). El nombre es `DD-MM-AAAA` en hora de Lima; al cambiar el día de Lima se abre una carpeta nueva. |

**Vercel no guarda archivos:** su disco es de solo lectura y por instancia, así que allí la copia duradera es **Vercel Logs** (o un drain a tu proveedor). La carpeta por día sirve para pruebas locales y para un servidor con disco; en Vercel se ignora salvo que se defina `LOG_DIR` a propósito. La carpeta `logs/` está en `.gitignore`.

| Variable | Valor por defecto | Para qué |
|---|---|---|
| `LOG_LEVEL` | `info` (`silent` en los tests) | `info`, `warn`, `error` o `silent`. |
| `LOG_TO_FILE` | apagado | `true` escribe también en la carpeta del día. |
| `LOG_DIR` | `logs` | Carpeta base. |

Escribir en disco es asíncrono y con cola: un turno nunca espera al disco, y si el disco falla el error se ignora (loguear no puede romper una respuesta).

## Qué tiene cada línea

Siempre: `time` (ISO), `level`, `event` y, dentro de un turno, `traceId`.

El `traceId` es **determinístico**: sale del número y del id del mensaje de WhatsApp. Si Meta reenvía el mismo mensaje, cae en el mismo `traceId`. Sin id de mensaje (el Sandbox) se calcula con la hora de inicio y el tamaño de la entrada.

| Evento | Nivel | Campos principales |
|---|---|---|
| `turn.start` | info | `waId` (últimos 4), `stateBefore`, `eventType`, `inputLength`, `inputPreview` (40 caracteres, solo donde es seguro) |
| `turn.note` | info / **warn** | `kind` y su detalle: `shortcut`, `lexical_guard`, `session_expired`, `confirmation_unknown`, `menu_fallback`, `no_coverage`, `booking_retry`, `booking_rejected`, `first_contact`, `out_of_scope` (con `inFlow: true` si la urgencia se escribió dentro de un flujo), `hora_declined`, `cita_closed` (con `reason`: `declined` o `no_other_dates`) |
| `turn.external` | info / warn / error | `service` (minsa, reniec, gemini, quejas), `operation`, `durationMs`, `outcome`, `resultStatus` |
| `external.http` | info / warn / error | `service`, `operation`, `method`, `path`, `status`, `durationMs` |
| `turn.end` | info / **warn** | `stateBefore`, `stateAfter`, `durationMs`, `externalCalls`, `externalMs`, `sentCount`, `slots`, `slotsChanged`, `notes`, `friction` |
| `turn.failed` | error | `stateBefore`, `durationMs`, `error` |
| `minsa.book_appointment.failed` | error | `endpoint`, `status`, `minsaMessage`, `response`, `payload` |
| `ai.fallback` | warn | `operation`, `fellBackTo`, `reason` |
| `turn.lock_timeout` | warn | `waId` (últimos 4), `layer` (`process` o `database`). Un turno esperó demasiado el candado y no se contestó; el ciudadano recibe el aviso fijo «escribe de nuevo» |
| `perimeter.dropped` / `.rejected` / `.muted` / `.banned` | info / warn | `waId`, `reason` (`repeat` entre los rechazos), `traceId` (el que tendría el turno). `muted` sale una vez por silencio de 2 minutos; el `dropped` del mensaje que inicia el silencio lleva `noticeSent: true` (es el único que recibe el aviso «espere 2 minutos») |

## Qué se oculta

Todo campo pasa por `lib/observability/mask.ts` antes de salir, aunque quien llama olvide taparlo:

- **DNI:** `****5678` (solo los 4 últimos). Vale para cualquier campo cuyo nombre lleve `dni` o `documento`.
- **Tokens:** `citaBearer`, `token`, `authorization`, `secret`, `twofa`, códigos OTP → `[redacted]`. Un `Bearer …` o un JWT dentro de un texto se reemplaza.
- **Números largos** (7 o más dígitos: teléfonos, un DNI escrito dentro de un mensaje) → `****1234`.
- **Teléfono / waId:** solo los 4 últimos (`...0111`).
- **Texto libre:** `initialMessageText` y las listas guardadas se reducen a su largo. Lo que se escribe en un paso de DNI, OTP, nombre o reclamo **nunca** se cita, solo su largo.

## Cómo encontrar lo que importa

Con `rg` sobre la carpeta del día (o el buscador de Vercel):

```bash
# Todo lo que pasó en un mensaje
rg '"traceId":"t-3fa9c2d41b7e"' logs/19-09-2026/app.ndjson

# Solo avisos y errores del día
bat logs/19-09-2026/alerts.ndjson

# Sesiones que caducaron, y por qué
rg '"kind":"session_expired"' logs/19-09-2026/app.ndjson

# Confirmaciones que no se entendieron (fricción)
rg '"kind":"confirmation_unknown"' logs/19-09-2026/app.ndjson

# Ciudadanos que cayeron en el menú sin respuesta
rg '"friction":"menu_loop"' logs/19-09-2026/app.ndjson

# Reservas que MINSA no aceptó
rg '"event":"minsa.book_appointment.failed"' logs/19-09-2026/app.ndjson
```

**Abandonos:** el último `turn.end` de un número con `stateAfter` en un paso de la cita (por ejemplo `cita_awaiting_hora_select`) y nada después es una conversación abandonada en ese paso. Con `session_expired` se sabe además cuánto llevaba parada.

## Cómo está armado

- `lib/observability/logger.ts`: el logger (NDJSON, niveles, enmascarado, `traceId` automático).
- `lib/observability/tracer.ts`: `createTurnTrace` y `traceTurn`, el ciclo de vida de un turno.
- `lib/observability/mask.ts`: qué se oculta.
- `lib/observability/file-sink.ts`: la carpeta por día.
- `lib/observability/http.ts`: `timedFetch`, el `fetch` que registra estado y duración.
- `lib/observability/context.ts`: el `traceId` del turno en curso (`AsyncLocalStorage`), para que una línea escrita dentro de un adaptador lo lleve sin pasarlo por parámetro.

La máquina de estados **sigue siendo pura**: los handlers no escriben logs. Devuelven `notes` (datos) en su resultado y el ejecutor (`runTurn`) es quien los registra. Por eso el aviso de sesión caducada sale del ejecutor y no de `session-expiry-guard.ts`.

Los logs `[turn-lock] …` de la rama anterior se mantienen con su formato de texto.
