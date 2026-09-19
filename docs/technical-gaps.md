# Gaps técnicos abiertos — rama `feat/lexical-guard`

Estado de la rama: **666 tests** en verde. Los gaps que tienen un test ejecutable están marcados con `gap()` (ver `tests/support/known-gap.ts`): en `npm test` cuentan como fallos esperados y `npm run test:gaps` los corre como tests normales para ver el fallo real. Cuando un gap se corrija, su test pasará a rojo en `npm test` y hay que quitarle el marcador `gap`.

---

## G1. Auto-agendado sin confirmación cuando el catálogo ofrece una sola opción

**Decisión (2026-09-19):** se mantiene el comportamiento actual en esta rama para no ampliar su alcance. **Se requiere una tarjeta posterior** para forzar siempre la pantalla de confirmación previa al agendado, incluso cuando exista una sola opción en el catálogo.

### Qué pasa hoy

Los pasos del catálogo (ubigeo, especialidad por pista, establecimiento, fecha) avanzan solos cuando hay una única opción. Eso es solo navegación de lectura y es inocuo. **El paso de horario también avanza solo, y ahí la siguiente acción es `book_appointment`**, que no se puede deshacer en silencio.

| Situación | Resultado hoy |
|---|---|
| El día tiene **un solo** horario | Agenda directo, sin mostrar «¿Confirmas el horario …?». |
| **Última página** de «Ver más horarios» con **un solo** horario sobrante (por ejemplo, 11 horarios: la página 2 tiene 1) | Agenda ese horario directo. El ciudadano solo había pedido ver más. |
| Todo el catálogo con una sola opción y especialidad y distrito ya conocidos | En **un solo turno**, el del OTP, encadena verificación, ubigeo, especialidad, establecimiento, fecha, horario y agendamiento. (Por eso el tope de pasadas del ejecutor pasó a 12.) |

Cuando el ciudadano **elige** un horario (toca una fila de la lista o pulsa un botón que nombra la hora) la elección es explícita y agenda directo, y así debe seguir. Cuando la hora **se escribe** a mano, siempre se pide confirmación. El agujero es exclusivamente la opción **auto-seleccionada**.

### Comportamiento deseado

Un horario único (o un único horario en una página) pasa a `cita_awaiting_hora_confirm` con `¿Confirmas el horario HH:MM - HH:MM?` y los botones **Sí, confirmar** / **No, ver horarios**. Nunca directo a `book_appointment`.

### Dónde está en el código

`resolveHoraCandidates` en `lib/fsm/handlers-cita.ts`, rama `items.length === 1`. También lo alcanza `buildHoraPage`. La confirmación ya existe (`askHoraConfirmation`, `handleHoraConfirm`).

### Criterio de aceptación de la tarjeta

1. Con un solo horario en el día, el bot muestra la confirmación y no consulta `book_appointment` hasta que el ciudadano confirma.
2. Con una última página de un solo horario, ocurre lo mismo.
3. Los flujos con lista de varios horarios no cambian: tocar una fila sigue agendando directo.
4. Se quitan los dos marcadores `gap` de `tests/stress/auto-booking.test.ts`; los tests de evidencia (los otros dos) se reemplazan por sus equivalentes con confirmación.
5. Se agrega un caso al `docs/qa/manual-test-playbook.md` (sección 3) para un día con un solo horario.

### Cómo verlo hoy

`npm run test:gaps` muestra los dos tests que fallan. Los dos tests de «evidencia» de `tests/stress/auto-booking.test.ts` demuestran el comportamiento actual.

---

## G2. Typo extremo en insultos

Un término a más de 3 ediciones de la palabra objetivo (por ejemplo `idotoaia`: **4** ediciones de «idiota», razón 0.67) no lo atrapa la distancia de Levenshtein. Ampliar la tolerancia para atraparlo marcaría palabras reales: con razón ≤ 0.50 se marcan 38 palabras de distritos del INEI (`maria`, `pedro`, `escudero`…), y con ≤ 0.35 ya se marcaban distritos reales (`Tarata`, `Taraco`, que hoy están protegidos por una lista de nombres oficiales).

- **Decisión:** aceptado. Sin regla de distancia segura; lo que sí se atrapa son las evasiones estructurales (letras sueltas, puntos, números, sufijos, consonantes dobles).
- **Test:** `gap` en `tests/security/lexical-guard.stress.test.ts` (`idotoaia`).

## G3. Mensaje sin respuesta cuando el candado por `waId` se agota

Si un turno espera demasiado el candado, se aborta con `TurnLockTimeoutError` y **el ciudadano no recibe respuesta**. Los límites son: 30 s en la cola en memoria (`TURN_PROCESS_LOCK_TIMEOUT_MS`), 20 s esperando uno de los 4 cupos de candado de la instancia y 10 s de `lock_timeout` en Postgres (`TURN_LOCK_TIMEOUT_MS`).

Por qué queda sin respuesta: el webhook ya contestó 200 a Meta antes de procesar (`after()`), así que el error solo se registra en consola y Meta no reintenta. No hay cola de reintentos. El Sandbox sí responde 503 «BUSY» para que el cliente reintente.

- **Tarjeta posterior:** decidir entre reintentar el turno una vez, responder un texto fijo de «estamos ocupados, escribe de nuevo» o encolar (p. ej. Redis/QStash).
- **Cómo verlo:** logs `[turn-lock]` y `Failed to process webhook entry` con `TurnLockTimeoutError`.

## G4. Latencia del candado sin medir desde Vercel

Desde una red lejana (159 ms por viaje a la base) el candado tarda **340 ms de mediana** en adquirirse: son 2 viajes (`BEGIN` y la sentencia del candado) y 134 ms en liberarse (`COMMIT`). Es distancia de red, no código, pero el presupuesto de 200 ms **no está certificado**. Falta medirlo desde una función de Vercel en la región de la base (Neon está en `us-east-1`; se espera `iad1`, confirmar la región de la función del proyecto).

- **Cómo medirlo:** durante la sección 4 del playbook, buscar en los logs `[turn-lock] database lock for ...NNNN took N ms`. Esa línea solo se escribe si tarda **200 ms o más**: si no aparece ninguna, la adquisición está por debajo del presupuesto.
- **Referencia:** `npm run smoke:neon` (mide el candado real; ejecutado desde red local).

## G5 a G8. Otros gaps abiertos (ya comunicados; sin cambios)

| Id | Gap | Detalle | Test |
|---|---|---|---|
| G5 | Spam corto no se filtra | Un primer mensaje de menos de 300 caracteres y sin enlaces (`🔥🔥🔥💰💰💰`, 48 letras repetidas) pasa el perímetro. | Playbook, caso 1.3 |
| G6 | Límite de ritmo por instancia | Los contadores viven en memoria de cada instancia serverless; no hay Redis. Una inundación repartida entre instancias se cuenta por separado. | `lib/security/rate-limiter.test.ts` |
| G7 | Tope de 4 turnos con candado por instancia | Evita agotar el pool de 10 conexiones; el costo es que una instancia atiende como máximo 4 turnos a la vez y los demás esperan hasta 20 s. Ajustable con `TURN_LOCK_MAX_CONCURRENCY`. | `lib/fsm/turn-lock.test.ts` |
| G8 | Comentario inexacto en `lib/prisma.ts` | Dice que el adaptador de Neon usa HTTP; en realidad usa un pool por WebSocket (necesario para las transacciones del candado). | — |

## Fuera del alcance de esta rama (auditoría del 2026-09-19)

Endpoints del operador sin autenticación; `from` controlado por el cliente en `/api/sandbox`; el token de MINSA (`citaBearer`) se devuelve al navegador y se guarda en `localStorage`.
