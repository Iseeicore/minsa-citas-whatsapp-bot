# Observabilidad: logs por turno con `traceId`

Cada mensaje del ciudadano deja **una línea de JSON por evento** (NDJSON) que se puede seguir de punta a punta con un solo `traceId`. No hay dependencias nuevas: es `JSON.stringify` más `console`, así que no espera a nada.

## Dónde quedan los logs

| Destino | Cuándo | Detalle |
|---|---|---|
| **stdout** (la terminal o `docker logs`) | Siempre | `info` sale por `console.info`, `warn` por `console.warn` y `error` por `console.error`, así quien lea la salida ve la severidad correcta. |
| **Carpeta por día** | Con `LOG_TO_FILE=true` | `logs/19-09-2026/app.ndjson` (todo) y `logs/19-09-2026/alerts.ndjson` (solo `warn` y `error`). El nombre es `DD-MM-AAAA` en hora de Lima; al cambiar el día de Lima se abre una carpeta nueva. |

**En Docker los archivos viven dentro del contenedor** y se pierden al recrearlo, así que allí la copia duradera es stdout (`npm run docker:logs`). La carpeta por día sirve para pruebas locales y para un servidor con disco. La carpeta `logs/` está en `.gitignore`.

| Variable | Valor por defecto | Para qué |
|---|---|---|
| `LOG_LEVEL` | `info` (`silent` en los tests) | `info`, `warn`, `error` o `silent`. |
| `LOG_TO_FILE` | apagado | `true` escribe también en la carpeta del día. |
| `LOG_DIR` | `logs` | Carpeta base. |

Escribir en disco es asíncrono y con cola: un turno nunca espera al disco, y si el disco falla el error se ignora (loguear no puede romper una respuesta).

## Qué tiene cada línea

Siempre: `time` (ISO), `level`, `event` y, dentro de un turno, `traceId`.

El `traceId` es **determinístico**: sale del número y del id del mensaje de WhatsApp. Si Meta reenvía el mismo mensaje, cae en el mismo `traceId`. Sin id de mensaje (el Chat-bot) se calcula con la hora de inicio y el tamaño de la entrada.

| Evento | Nivel | Campos principales |
|---|---|---|
| `turn.start` | info | `waId` (últimos 4), `stateBefore`, `eventType`, `inputLength`, `inputPreview` (40 caracteres, solo donde es seguro) |
| `turn.note` | info / **warn** | `kind` y su detalle: `shortcut`, `lexical_guard`, `session_expired`, `confirmation_unknown`, `menu_fallback`, `no_coverage`, `booking_retry`, `booking_rejected`, `first_contact`, `out_of_scope` (la urgencia va como aviso y lleva `closed: true`: cerró la conversación), `hora_declined`, `cita_closed` (con `reason`: `declined`, `no_other_dates`, `no_other_establecimiento` o `abandoned`), `exit_intent` (el ciudadano pidió salir; `source`: `local` o `ai`), `change_distrito` (el ciudadano dijo que ya no quiere esa ubicación y se le ofreció otro distrito; `source`: `local` o `ai`), `retired_state` (aviso: la sesión guardada estaba en un estado de referencias que ya no existe; con `state` se vuelve a pedir el documento con una sesión limpia), `send_failed` (aviso: un mensaje del turno no llegó a la persona; `effect` es su tipo y `outcome` dice si Meta lo rechazó, `rejected`, o falló en la red, `failed`. Si era interactivo, la sesión no queda esperando un toque sobre él: el mensaje interactivo anterior queda consumido) |
| `turn.external` | info / warn / error | `service` (minsa, gemini, database, media), `operation`, `durationMs`, `outcome`, `resultStatus` |
| `external.http` | info / warn / error | `service`, `operation`, `method`, `path`, `status`, `durationMs` |
| `turn.end` | info / **warn** | `stateBefore`, `stateAfter`, `durationMs`, `externalCalls`, `externalMs`, `sentCount`, `slots`, `slotsChanged`, `notes`, `friction` |
| `turn.failed` | error | `stateBefore`, `durationMs`, `error` |
| `minsa.book_appointment.failed` | error | `endpoint`, `status`, `minsaMessage`, `response`, `payload` |
| `minsa.catalog.rows_discarded` | warn | `endpoint`, `discarded`, `total`. Filas de un catálogo o de las referencias médicas que no pasaron la validación de la frontera |
| `minsa.request_blocked` | error | `path`, `reason`. Una llamada autenticada al MINSA real no se envió porque falta `MINSA_DIGITAL_APP_URL` y no se puede armar `Origin` ni `Referer`; quien llamó recibe un 503 sin cuerpo y lo trata como error del MINSA |
| `ai.fallback` | warn | `operation`, `fellBackTo`, `reason` |
| `turn.lock_timeout` | warn | `waId` (últimos 4), `layer` (`process` o `database`). Un turno esperó demasiado el candado y no se contestó; el ciudadano recibe el texto fijo «Ocurrió un inconveniente temporal…», **como mucho una vez cada 30 s por número** (C4.2: una ráfaga que falla entera no manda un aviso por mensaje) |
| `webhook.message_failed` | error | `waId` (últimos 4), `error` (nombre y mensaje). Falló guardar la conversación, el turno o sus envíos; el ciudadano recibe el mismo texto fijo, con el mismo límite de una vez cada 30 s por número. El turno, si llegó a empezar, ya dejó su `turn.failed`. **El registro nunca se calla:** el límite de 30 s solo frena la respuesta al ciudadano |
| `perimeter.dropped`, `perimeter.rejected`, `perimeter.muted`, `perimeter.banned` | info / warn | `waId`, `reason` (`repeat` entre los rechazos), `traceId` (el que tendría el turno). `perimeter.muted` sale una vez por silencio de 2 minutos; el `perimeter.dropped` del mensaje que inicia el silencio lleva `noticeSent: true` (es el único que recibe el aviso «espere 2 minutos»). Una imagen del paso de evidencia que pasa su propio tope sale como `perimeter.dropped` con `reason: throttled`, `messageType: image` y `limit: more than 6 evidence images in 10 s`, sin aviso; su bloqueo de 1 hora sale como `perimeter.banned` con `limit: more than 20 evidence images in 60 s`. `perimeter.banned` y `perimeter.muted` llevan `durationMs` (3600000 el bloqueo, 120000 el silencio) y `limit`, armados con las constantes de `lib/constants/limits/perimeter.ts` |
| `turn_lock.waited` | info | `waId` (últimos 4), `waitedMs`, `layer` (`process` o `database`). Un turno esperó a otro del mismo ciudadano más de lo normal |
| `inbound.latency` | info | `waId` (últimos 4), `traceId`, `channel`, `stagesMs` y `totalMs`. Una línea por mensaje de WhatsApp que pasó el perímetro, con la duración de cada etapa: `perimeter` (filtros en memoria), `staged` (usuario, mensaje y sesión en la base), `window` (ventana de agrupado y `summarize`), `lock` (espera del candado), `turn` (hasta el primer efecto) y `first_send` (primer POST a Meta). Es la medida de punta a punta que decide dónde está el tiempo (base lejana, candado, ventana) |
| `sandbox.latency` | info | Igual que `inbound.latency` para `/api/sandbox`: etapas `reset`, `exists`, `lock` y `turn` |
| `inbound.stale_tap` | info | `waId` (últimos 4), `type` (`button` o `list`), `state` y `channel`. La persona tocó un botón o una fila de un mensaje que ya no es el último interactivo, o que ya se respondió (doble toque). Se ignora en silencio: no hay respuesta, la sesión no cambia y en WhatsApp el mensaje no se marca como leído. Si el toque no dice a qué mensaje responde, o la conversación no tiene un mensaje interactivo recordado, se procesa como siempre |
| `inbound.expired_on_boot` | info | `expired`. Al arrancar, cuántos mensajes entrantes quedaron pendientes por una caída y se vencieron sin responderse |
| `inbound.expire_failed` | warn | `error`. No se pudo vencer los pendientes al arrancar; el servidor arranca igual |
| `webhook.entry_failed` | error | `error`. Falló procesar una entrada del webhook fuera del turno (perímetro, estados de entrega); el ciudadano no recibe aviso |
| `webhook.bsuid_updated` | info | `previous`, `current` (últimos 4). Meta avisó que cambió el identificador de una persona (cambió de número): su usuario y su sesión pasan al identificador nuevo |
| `webhook.bsuid_conflict` | warn | `previous`, `current` (últimos 4). El identificador nuevo ya tenía usuario propio; no se fusionan y el anterior queda como está (limitación conocida) |
| `webhook.bsuid_update_failed` | error | `previous`, `current` (últimos 4), `error`. Falló aplicar el cambio de identificador; no afecta a los mensajes del mismo webhook |
| `webhook.signature_secret_missing` | error | Sin campos. Llegó un webhook y `META_APP_SECRET` no está configurada (o está en blanco): se rechaza con 403 sin comprobar la firma, nunca con una clave vacía. Al arrancar ya salió `config.invalid` con `META_APP_SECRET_MISSING` |
| `webhook.fixed_reply_failed` | error | `waId` (últimos 4), `error`. No se pudo enviar una respuesta fija (perímetro o texto de falla) |
| `whatsapp.send_failed` | error | `operation` (`send_effect`, `send_cta_url` o `fixed_reply`), `waId` (últimos 4) y `error` cuando el envío falla en la red. Cuando Meta rechaza un enlace (`send_cta_url`) o una respuesta fija del perímetro o de falla (`fixed_reply`), lleva `status`, `errorCodeNumber` y `errorMessage` (código y mensaje del error de Meta, enmascarado; nunca el texto enviado), o `bodyError` si el cuerpo del rechazo no se pudo leer |
| `whatsapp.sent_without_id` | warn | `reason` (`missing_id` o `unreadable_body`) y, si aplica, `error`. Meta aceptó el mensaje pero su respuesta no trae el identificador: se guarda sin `wa_message_id` y, si era interactivo, la conversación deja de recordar el anterior para que el toque nuevo no se tome por viejo |
| `outbound.limit_violation` | warn | `waId` (últimos 4), `kind` (tipo de mensaje) y `violations` (campo, regla, posición, valor y límite; nunca el texto). El mensaje no cumplía los límites de Meta y se envió en su lugar un texto simple con el cuerpo y las opciones numeradas (1., 2., …), recortado a 4096 caracteres |
| `outbound.rejected` | error | `waId` (últimos 4), `kind`, `status`, `errorCodeNumber` y `errorMessage` (código y mensaje del error de Meta, enmascarado; nunca el resto del cuerpo ni el texto enviado), o `bodyError` si el cuerpo del rechazo no se pudo leer. Meta rechazó un mensaje: si era interactivo se reintenta **una sola vez** como texto simple con las opciones numeradas; si ese texto también falla, o el rechazado ya era texto, solo queda el registro |
| `whatsapp.typing_failed` | warn | `error` si falló en la red; `status`, `errorCodeNumber` y `errorMessage` si Meta lo rechazó. Falló el indicador de «escribiendo»; la respuesta sigue su curso |
| `whatsapp.media_failed` | warn | `error`. No se pudo descargar la foto; la incidencia sigue sin imagen |
| `incidencia.invalid_submission` | error | `fields` (nombres de los campos inválidos, nunca sus valores). La incidencia llegó al servicio con datos que no pasan la validación; no se guarda |
| `incidencia.not_persisted` | error | `reason`. No hay base de datos configurada (`DATABASE_ENABLED=false`): la incidencia no se puede guardar y se le responde error al ciudadano |
| `incidencia.media_upload_failed` | error | `error`. El servicio de imágenes falló o no respondió una ruta; no se guarda nada y el ciudadano puede reintentar |
| `incidencia.persist_failed` | error | `error`. Falló el guardado de la incidencia en la base; el ciudadano recibe el aviso de que no se pudo registrar |
| `incidencia.daily_limit_reached` | warn | `limit`. Un teléfono quiso registrar más incidencias que el tope diario (día de Lima); no se guarda y se le avisa que podrá registrar otra mañana |
| `incidencia.consulta_unavailable` | error | `reason`. Se quiso consultar una incidencia con la base apagada (`DATABASE_ENABLED=false`); la persona recibe «inténtalo más tarde» |
| `incidencia.consulta_failed` | error | `error`. Falló la consulta de una incidencia en la base; la persona recibe «inténtalo más tarde» y la sesión termina |
| `incidencia.listado_unavailable` | error | `reason`. Se quiso listar todas las incidencias con la base apagada (`DATABASE_ENABLED=false`); la persona recibe «inténtalo más tarde» |
| `incidencia.listado_failed` | error | `error`. Falló el listado de incidencias en la base; la persona recibe «inténtalo más tarde» y la sesión termina |
| `terminos.persist_failed` | error | `canal`, `version` y `error`. Falló el guardado de la aceptación de los términos y condiciones; la cita sigue igual, porque la persona ya aceptó en la conversación |
| `terminos.url_missing` | warn | Sin campos. Se pidieron los términos por whatsapp-bot y `TERMINOS_URL` está vacía: se envían solo los botones Acepto y No acepto, sin el enlace «Ver términos» |
| `incidencia.establecimiento_lookup_failed` | error | `by` (`codigo` o `nombre`) y `error`. Falló la búsqueda del establecimiento en el padrón; el flujo trata el resultado como no disponible y pide la ubicación de otra forma |
| `ai.provider_unknown` | warn | `provider`. `AI_PROVIDER` no corresponde a ningún proveedor registrado: la IA queda desactivada y se usan los respaldos fijos |
| `sandbox.turn_failed` | error | `waId` (últimos 4), `error` (nombre y mensaje). Falló el turno de `POST /api/sandbox` por un motivo que no es el candado; se responde el 500 genérico `INTERNAL` sin detalle. Si fue el candado, sale `turn.lock_timeout` y se responde `BUSY` |
| `sandbox.cors_invalid_origin` | warn | `entry`. Una entrada de `SANDBOX_ALLOWED_ORIGINS` no es una URL y se ignora |
| `sandbox.signature_rejected` | warn | `reason` (`missing`, `invalid` o `expired`). `POST /api/sandbox` recibió una petición sin firma válida con `SANDBOX_SHARED_SECRET` definido |
| `config.invalid` | error / warn | `issue` (el código del catálogo), `value`, `message`. Problema de configuración detectado al arrancar el servidor (ver `lib/config/config-errors.ts`); el bot sigue funcionando con su respaldo y `/api/health` responde `degraded` |

## Qué se oculta

Todo campo pasa por `lib/observability/mask.ts` antes de salir, aunque quien llama olvide taparlo:

- **DNI:** `****5678` (solo los 4 últimos). Vale para cualquier campo cuyo nombre lleve `dni` o `documento`.
- **Tokens:** `citaBearer`, `token`, `authorization`, `secret`, `twofa`, códigos OTP → `[redacted]`. Un `Bearer …` o un JWT dentro de un texto se reemplaza.
- **Nombre de persona:** los campos `nombre` y `nombreCompleto` → `[redacted]`. Los nombres de establecimiento y de especialidad (`citaEstablecimientoNombre`, `citaEspecialidadNombre`, `incidenciaEstablecimientoNombre`) se muestran tal cual.
- **Números largos** (7 o más dígitos: teléfonos, un DNI escrito dentro de un mensaje) → `****1234`.
- **Teléfono / waId:** solo los 4 últimos (`...0111`).
- **Texto libre:** `initialMessageText` y las listas guardadas se reducen a su largo. Lo que se escribe en un paso de DNI, OTP, nombre o incidencia **nunca** se cita, solo su largo.

## Cómo encontrar lo que importa

Con `rg` sobre la carpeta del día (o sobre la salida de `npm run docker:logs`):

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

La espera del candado se registra como el evento `turn_lock.waited` (ver la tabla de eventos).
