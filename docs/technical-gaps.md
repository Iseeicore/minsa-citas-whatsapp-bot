# Gaps técnicos

Estado: G1, G3, G5 y G8 cerrados (Bloques 1, 2 y 4 del plan de acción de la auditoría). Siguen abiertos G2 (aceptado), G4 (sin medir), G6 y G7. Los gaps que tienen un test ejecutable están marcados con `gap()` (ver `tests/support/known-gap.ts`): en `npm test` cuentan como fallos esperados y `npm run test:gaps` los corre como tests normales para ver el fallo real. Cuando un gap se corrija, su test pasará a rojo en `npm test` y hay que quitarle el marcador `gap`.

---

## G1. Auto-agendado sin confirmación cuando el catálogo ofrece una sola opción — **cerrado**

**Estado:** cerrado en el Bloque 4 del plan de acción de la auditoría.

Los pasos del catálogo (ubigeo, especialidad por pista, establecimiento, fecha) avanzan solos cuando hay una única opción: es solo navegación de lectura e inocua. El paso de horario también avanzaba solo, y ahí la siguiente acción es `book_appointment`, que no se puede deshacer en silencio.

### Qué hace ahora

| Situación | Resultado |
|---|---|
| El día tiene **un solo** horario | `Solo hay un horario disponible: HH:MM - HH:MM. ¿Lo confirmas?` con **Sí, confirmar** / **No, gracias**. No agenda hasta que el ciudadano confirma. |
| **Última página** de «Ver más horarios» con un solo horario sobrante | Igual: pide confirmación. |
| Reintento tras una reserva rechazada que deja un solo horario | Igual: pide confirmación (antes volvía a agendar solo). |
| El ciudadano **toca una fila** de una lista de varios horarios | Sin cambios: es una elección explícita y agenda directo. |
| La hora se **escribe** a mano | Sin cambios: se pide confirmación. |

### Cómo se confirma

- El botón **Sí, confirmar**, un sí escrito (`si`, `dale`, `ok`…), o decir que toma **ese** horario: `esa hora`, `esa misma`, `me sirve`, `me conviene`, `la tomo`, o escribir la hora pendiente (`13:00`, `a la 1`). Cualquier negación (`no a la 1`) o una hora distinta repite la pregunta sin agendar. Esto vale para toda confirmación de horario, no solo la del horario único.
- **No** (botón o escrito), con una lista de la página anterior: vuelve a ella y retrocede el contador de página (así `Ver más horarios` no queda vacío).
- **No** al horario único de un día (no hay lista a la que volver): el bot **no cierra**. Recomienda otra fecha: `¿Deseas cambiar de fecha?` con **Sí, otra fecha** / **No, salir**. Con sí, vuelve a consultar las fechas (sin pedir DNI ni OTP) y **no vuelve a ofrecer las ya rechazadas**; con no, o si no queda otra fecha, se despide con una disculpa y cierra la sesión (sin pedirle que escriba CITAS).

### Dónde está en el código

`resolveHoraCandidates` (`lib/fsm/flows/cita/steps/hora/list.ts`), `askHoraConfirmation` (`lib/fsm/flows/cita/steps/hora/ask-or-book.ts`) y `handleHoraConfirm` (`lib/fsm/flows/cita/steps/hora/confirm.ts`) y `handleFechaPending` en `lib/fsm/flows/cita/steps/fecha.ts`; el lector de frases en `isSlotAcceptance` (`lib/fsm/parsing/confirmation-parser.ts`); la pregunta de otra fecha en `lib/fsm/flows/cita/steps/other-fecha.ts` (estado `cita_awaiting_other_fecha`, cierre `cita_declined_closed`). La marca de «único horario» es el slot `citaHoraConfirmOnly` y las fechas rechazadas viven en `citaFechasDescartadas` (se borran al cambiar de distrito).

### Pruebas y cómo verlo

`lib/fsm/flows/cita/single-horario.test.ts`, `lib/fsm/flows/cita/other-fecha.test.ts` y `tests/stress/auto-booking.test.ts` (ya no llevan marcador `gap`). A mano: caso 3.17 del playbook; el catálogo fake tiene una tercera fecha con un solo horario.

### Nota: fecha y hora legibles (no es un gap, es una mejora aparte)

Lo que el ciudadano lee ya no es la fecha ni la hora cruda que entrega MINSA (`22/09/2026`, o `20260922` sin separadores en el catálogo fake) ni siempre en 24 horas (`13:00 - 13:30`). Las filas de lista muestran día de semana + fecha con el mes en letras (`mar 22 sep`) y las horas en 12 horas con AM/PM (`1:00 PM - 1:30 PM`); los mensajes de texto («Fecha encontrada…», «¿Confirmas el horario…?», «Solo hay un horario disponible…») usan la fecha larga (`martes 22 de septiembre`). **Lo que viaja a MINSA no cambió**: `citaFecha` y `horaInicio` se guardan y se envían tal cual MINSA los entregó; `formatFechaForApi` y `formatHoraCita` (`lib/fsm/core/executor.ts`) siguen convirtiéndolos al formato que la API espera justo antes de la llamada, como ya lo hacían. Las funciones nuevas son `formatDateLong`/`formatDateShort` (`lib/fsm/parsing/date-parser.ts`) y el ya existente `formatHora12` (`lib/fsm/flows/cita/steps/hora/format.ts`), ahora también usado en las listas. Un `fechaCupo` en un formato que `parseOfferedDate` no reconoce cae de vuelta al texto crudo: nunca rompe una fila.

---

## G2. Typo extremo en insultos

Un término a más de 3 ediciones de la palabra objetivo (por ejemplo `idotoaia`: **4** ediciones de «idiota», razón 0.67) no lo atrapa la distancia de Levenshtein. Ampliar la tolerancia para atraparlo marcaría palabras reales: con razón ≤ 0.50 se marcan 38 palabras de distritos del INEI (`maria`, `pedro`, `escudero`…), y con ≤ 0.35 ya se marcaban distritos reales (`Tarata`, `Taraco`, que hoy están protegidos por una lista de nombres oficiales).

- **Decisión:** aceptado. Sin regla de distancia segura; lo que sí se atrapa son las evasiones estructurales (letras sueltas, puntos, números, sufijos, consonantes dobles).
- **Test:** `gap` en `tests/security/lexical-guard.stress.test.ts` (`idotoaia`).

## G3. Mensaje sin respuesta cuando el candado por `waId` se agota — **cerrado (texto fijo)**

**Estado:** cerrado en el Bloque 4. Si un turno espera demasiado el candado se aborta con `TurnLockTimeoutError` y, en vez de dejar al ciudadano sin respuesta, el webhook le envía un texto fijo: `Ocurrió un inconveniente temporal al procesar tu solicitud. Por favor, intenta escribir nuevamente en unos instantes.` (`TURN_FAILURE_TEXT`, `lib/fsm/session/turn-lock.ts`), **como mucho una vez cada 30 s por número** (`lib/fsm/core/failure-notice.ts`, consideración C4.2 del Word: sin este límite, una ráfaga que falla entera manda un aviso por cada mensaje). El mismo texto cubre **cualquier fallo inesperado** al procesar un mensaje (guardar la conversación, el turno o sus envíos), no solo el candado agotado; se registra como `turn.lock_timeout` (advertencia) o `webhook.message_failed` (error). El aviso sale por el mismo camino que las respuestas del perímetro (`sendFixedReply`), sin pasar por la máquina de estados. El Sandbox ya respondía 503 «BUSY».

Los límites son los mismos: 30 s en la cola en memoria (`TURN_PROCESS_LOCK_TIMEOUT_MS`), 20 s esperando uno de los 4 cupos de candado de la instancia y 10 s de `lock_timeout` en Postgres (`TURN_LOCK_TIMEOUT_MS`).

- **Qué queda igual:** el mensaje que no se pudo atender **no se reintenta** solo; el ciudadano lo escribe de nuevo. No hay cola de reintentos (Redis/QStash quedó fuera del alcance).
- **Cómo verlo:** log `turn.lock_timeout` (warn) con `layer`, o `webhook.message_failed` (error) con el error, y los últimos 4 dígitos del número.
- **Pruebas:** `tests/security/webhook-perimeter.test.ts`, bloque «the turn lock timed out».

## G4. Latencia del candado sin medir desde Vercel

Desde una red lejana (159 ms por viaje a la base) el candado tarda **340 ms de mediana** en adquirirse: son 2 viajes (`BEGIN` y la sentencia del candado) y 134 ms en liberarse (`COMMIT`). Es distancia de red, no código, pero el presupuesto de 200 ms **no está certificado**. Falta medirlo desde una función de Vercel en la región de la base (Neon está en `us-east-1`; se espera `iad1`, confirmar la región de la función del proyecto).

- **Cómo medirlo:** durante la sección 4 del playbook, buscar en los logs el evento `turn_lock.waited` con `layer: "database"` (el campo `waitedMs` da la duración). Esa línea solo se escribe si tarda **200 ms o más**: si no aparece ninguna, la adquisición está por debajo del presupuesto.
- **Referencia:** `npm run smoke:neon` (mide el candado real; ejecutado desde red local).

## G5 a G8. Otros gaps abiertos (ya comunicados; sin cambios)

| Id | Gap | Detalle | Test |
|---|---|---|---|
| G5 | Spam corto sin palabras — **cerrado (Bloque 2)** | Un primer mensaje con el mismo carácter 10 o más veces seguidas, o solo emojis (6 o más), se rechaza con la razón `repeat`. Un spam corto con palabras variadas sigue pasando: no hay regla segura contra eso. | `lib/security/payload-filter.test.ts`, playbook 1.3b-c |
| G6 | Límite de ritmo por instancia | Los contadores viven en memoria de cada instancia serverless; no hay Redis. Una inundación repartida entre instancias se cuenta por separado. | `lib/security/rate-limiter.test.ts` |
| G7 | Tope de 4 turnos con candado por instancia | Evita agotar el pool de 10 conexiones; el costo es que una instancia atiende como máximo 4 turnos a la vez y los demás esperan hasta 20 s. Ajustable con `TURN_LOCK_MAX_CONCURRENCY`. | `lib/fsm/session/turn-lock.test.ts` |
| G8 | Comentario inexacto en `lib/db/prisma.ts` — **cerrado (Bloque 1)** | El comentario ya dice que el adaptador de Neon usa un pool por WebSocket (necesario para las transacciones del candado). | — |

## Fuera del alcance de esta rama (auditoría del 2026-09-19)

Endpoints del operador sin autenticación; `from` controlado por el cliente en `/api/sandbox`; el token de MINSA (`citaBearer`) se devuelve al navegador y se guarda en `localStorage`.
