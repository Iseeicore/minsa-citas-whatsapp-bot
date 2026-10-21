# Flujo de referencias

Cómo consulta la persona sus referencias médicas con el servicio «Consultar Referencias» y cómo se enlaza con la cita. Código en `lib/fsm/flows/referencia/`; reutiliza los pasos de identidad y de selección de referencia de cita, que tiene su propio árbol en [flujo-cita.md](flujo-cita.md). Para el servicio hermano de incidencias, ver [flujo-incidencia.md](flujo-incidencia.md).

## Entradas

No lleva bandera: está siempre disponible. La entrada, la fila del menú y la numeración son las mismas en whatsapp-bot y en el Chat-bot. La selección de una referencia real avanza directamente a fechas en ambos canales; las demos conservan sus pasos anteriores.

| Entrada | Canal | Cómo se reconoce | Dónde |
|---|---|---|---|
| Fila «Consultar Referencias» | whatsapp-bot y Chat-bot | Fila del menú (`consultar_referencia`) o el número `2` | `main-menu.ts`, `first-contact.ts` |
| Palabra clave | whatsapp-bot y Chat-bot | Mensaje corto (hasta 8 palabras) que dice «referencia» o «referencias» y solo lleva palabras de relleno (quiero, deseo, necesito, consultar, ver, revisar, saber, mi, mis, de, la, las, el, estado, médica): «referencia», «quiero consultar mi referencia», «estado de mi referencia». Va **antes** de fuera de alcance | `isReferenciaKeyword` en `menu-shortcuts.ts`; las palabras, en `lib/constants/palabras-clave.ts` |
| Botón «Consultar referencia» | whatsapp-bot y Chat-bot | Respuesta a la elección que reciben los mensajes OOS-03 (ver abajo) | `handleReferenciaChoice` en `main-menu.ts` |
| Intención de la IA | whatsapp-bot y Chat-bot | Texto libre del menú principal que no reconoció ningún atajo y que la IA lee como un pedido de ver la referencia o la derivación (por ejemplo, con la palabra mal escrita: «quiero ver mi refrencia del hospital») | intención `referencia` en `lib/fsm/parsing/ai/main-menu-intent.ts`; el prompt, en `lib/constants/prompts/main-menu-intent.ts`; la entrada, en `handleMainMenuIntentPending` |

La fila ocupa el segundo lugar en los dos canales, y los números escritos apuntan a lo mismo en whatsapp-bot y en el Chat-bot:

| Número escrito | Con incidencias encendidas | Con incidencias apagadas |
|---|---|---|
| `1` | Agendar una cita médica | Agendar una cita médica |
| `2` | Consultar Referencias | Consultar Referencias |
| `3` | Registrar una incidencia | «Por ahora solo puedo ayudarte a agendar una cita médica o a consultar una referencia.» y el menú |
| `4` | Consultar una incidencia | el mismo aviso y el menú |

El texto de rechazo del primer mensaje ofrece la misma numeración: «[1] Citas [2] Referencia [3] Incidencias», o «[1] Citas [2] Referencia» con las incidencias apagadas.

La IA del menú distingue la referencia de la cita: un pedido de cita es `cita` aunque mencione la referencia («quiero sacar cita», «cita por referencia»), y solo el pedido de ver la referencia o su estado es `referencia`. La palabra clave va antes de la IA.

Un mensaje que menciona la referencia sin ser un pedido corto («¿Ya aceptaron mi referencia?», «quiero una cita por referencia», «tengo mi hoja de referencia…», «¿qué es la contrarreferencia?») sigue cayendo en la categoría de fuera de alcance OOS-03, en el primer mensaje y en el menú, en los dos canales. Ya no recibe un texto largo: recibe un solo mensaje con dos botones (estado `main_menu_referencia_choice`):

> Gestión de Referencias Médicas:
>
> Para una cita en hospital o instituto, tu centro de origen debe emitir la Hoja de Referencia (REFCON).
>
> ¿Qué deseas hacer?
>
> [Consultar referencia] [Agendar cita]

- **Consultar referencia**, escribir `1` o `uno`, el título exacto del botón o el pedido corto de la referencia («referencia», «quiero consultar mi referencia»): la misma entrada que la fila «Consultar Referencias» (pide iniciar sesión).
- **Agendar cita**, escribir `2` o `dos`, el título exacto del botón, `CITA` o `CITAS`: la misma entrada que la palabra CITAS en el menú (pide el documento).
- El título se compara sin importar mayúsculas, tildes ni signos, pero completo: «agendar», «no quiero cita» o «consultar cita mañana» no cuentan y repiten los botones.
- Los números siguen el orden de los botones, no el del menú principal (donde `1` es la cita y `2` la referencia).
- Cualquier otra respuesta repite los botones con el aviso «No pudimos identificar tu respuesta…»; un insulto, el recordatorio de respeto y los botones; una emergencia corta la conversación igual que en el menú, sin límite de largo. Un toque en un botón de un mensaje anterior se ignora, como en el resto del bot.
- La emergencia (OOS-01), los atajos de mayor prioridad y el pedido corto de la referencia se revisan antes. «punto de referencia» (una dirección) no cuenta como referencia.

Las demos del piloto comercial (DNI `10308523` y `47391441`) solo se alcanzan por este servicio: después de iniciar sesión con normalidad, en lugar de consultar MINSA se muestran sus referencias de demostración (`lib/fsm/flows/cita/steps/demo/`). En la cita esos documentos siguen el camino normal.

## Pasos

```
entrada → documento y OTP → consultar referencias
├─ con referencias → listado
│  ├─ reales, web y WhatsApp → elegir referencia → fechas → horario → resumen → confirmar reserva
│  └─ demos → detalle y confirmación de referencia → recorrido anterior de cita
└─ sin referencias → «¿Deseas agendar una cita?» → Sí: cita sin repetir identidad / No: despedida
```

1. **Entrada.** El bot responde «Para consultar tu referencia debes iniciar sesión. Ingresa tu número de documento.» y marca en la sesión el propósito `referencias` (`postLoginFlow`). No se pide ningún código de referencia: el backend solo lista por documento.
2. **Identidad.** Son los pasos de la cita, sin duplicarlos: documento (DNI o carnet de extranjería) → validación en MINSA → OTP → verificación. Los errores y los límites (3 intentos de OTP, registro pendiente) son los de cita. Al verificarse, el propósito decide el siguiente paso: con `referencias` se consultan las referencias de este servicio; al entrar por Agendar en ambos canales se consulta con propósito `cita_referencias` para ofrecer la modalidad antes del distrito.
3. **Consulta.** Estado `referencia_lookup_pending`: se consulta `/whatsapp/api/v1/references` con el número y el tipo de documento (`lib/integrations/minsa/references.ts`). El servidor envía el token obtenido al verificar el OTP en `Authorization: Bearer`; se reutiliza el cliente autenticado de fechas, horarios y reservas. Los reintentos usan el token vigente y, después de verificar de nuevo, el token renovado. El token no se añade al cuerpo de consulta.
   - La respuesta real es un arreglo raíz de referencias, sin un sobre `status_reference`/`data`. El esquema valida la colección y el lector existente convierte cada fila. Un arreglo vacío se representa internamente como `empty`; uno con filas válidas, como `found`. Un fallo HTTP, JSON inválido, un objeto en lugar de arreglo o una colección no vacía sin filas válidas se representa como `error`. Esos estados describen el resultado interno de la consulta y no sustituyen el estado de cada referencia.
   - Se conservan los identificadores opacos, los ceros iniciales del número y los códigos de destino, aunque la descripción de una UPS esté vacía. No se filtra por los estados 3, 5 o 7. `fecha_inicio` se muestra como información de la referencia y no se usa como fecha de una cita programada.
4. **Con referencias** (`found`). Se muestra la lista «Estas son tus referencias:». La web pagina 10 opciones; WhatsApp 7 para reservar espacio a los controles. En WhatsApp la especialidad ocupa el título de hasta 24 caracteres y destino, número, fecha y estado forman una descripción de hasta 72. El chat web utiliza tarjetas: especialidad o atención destacada primero, número y estado separados, destino, origen y fecha de referencia completos en líneas adaptables. Una especialidad sin descripción se presenta como «Especialidad no informada»; el hospital no la sustituye. La búsqueda web incluye todos los datos completos de la tarjeta. Se conservan los estados recibidos de MINSA, sin filtros adicionales.
   - **Referencia real en ambos canales:** elegirla consulta directamente sus fechas, sin la pregunta «¿Es esta tu referencia?». El establecimiento y la especialidad quedan fijados por los códigos IPRESS y UPS exactos recibidos, conservando también el identificador opaco de la referencia. Sólo se ofrecen fechas y horarios con cupos mayores que cero. Tras elegir el horario se muestra el resumen y se exige confirmarlo antes de reservar con `referencia_id`. Una referencia incompleta informa el problema y permite elegir cómo continuar, sin inventar destino ni especialidad.
   - **Demos:** conservan su detalle, confirmación de referencia y recorrido de demostración.
   - **Cambiar referencia en ambos canales:** disponible en fechas, horarios, elección de otra fecha y resumen final. Recupera el listado y limpia la selección, códigos, fecha, horarios y contadores anteriores, conservando la identidad y las referencias. La paginación y esta acción se integran en la misma interacción que la lista, para que las opciones de atención permanezcan activas. También se admite el texto exacto «Cambiar referencia».
   - **Disponibilidad en ambos canales:** si no quedan fechas con cupos, pregunta «No encontramos cupos disponibles para esta referencia. ¿Deseas seleccionar otra referencia?» en `referencia_awaiting_other_reference`, con **Sí** y **No, salir**. No ofrece el listado automáticamente: **Sí** limpia la selección anterior y recupera sus referencias, conservando la identidad; **No** responde con `REFERENCIA_GOODBYE_TEXT` y termina en `referencia_closed`, sin credenciales, datos de cita ni contadores. Sólo se mantiene el control interno de interacción consumida para rechazar botones anteriores. Los botones y las respuestas escritas usan el mismo recorrido; una respuesta desconocida repite la pregunta. Si faltan horarios para una fecha, permite otra fecha o referencia. Un fallo técnico al consultar fechas u horarios muestra un aviso distinto y recupera el listado. No se utiliza la falta de cupos para cambiar silenciosamente el destino o la especialidad.
   - **Límites de WhatsApp:** paginación y cambio pasan como filas de la misma lista Graph; hasta 7 opciones y 3 controles suman un máximo de 10 filas. La confirmación final utiliza como máximo 3 botones. No se separan las opciones de su mensaje vigente. Si Graph devuelve HTTP 400, el respaldo de texto conserva los títulos de navegación y **Cambiar referencia** sin numerarlos como opciones reservables; la persona puede escribirlos para continuar.
5. **Oferta de cita del servicio Consultar Referencias.** Conserva su comportamiento histórico para `empty`, `error`, cualquier otro estado, o `found` sin ninguna referencia válida: dice «No cuentas con referencias registradas.» y pregunta «¿Deseas agendar una cita?» con **Sí** / **No** (estado `referencia_awaiting_cita_offer`). La entrada por **Agendar** en ambos canales sí distingue ausencia y error, como describe [flujo-cita.md](flujo-cita.md#elección-de-cita-nueva-o-con-referencia-en-ambos-canales).
   - **Sí:** sigue la cita con la identidad ya verificada: pide el distrito, no vuelve a pedir documento ni código.
   - **No:** «Entendido. Cuando necesites consultar una referencia o agendar una cita, escríbenos. ¡Que tengas un buen día!» y la sesión termina (`referencia_closed`); el siguiente mensaje empieza de nuevo.
   - Una respuesta que no se entiende repite los botones.

## Sesión vencida

Los estados que esperan una respuesta ya verificada vigilan inactividad (más de 10 minutos) y vencimiento del token (menos de 30 segundos): `referencia_awaiting_cita_offer`, `cita_awaiting_referencia_select`, confirmación histórica y las elecciones `referencia_awaiting_appointment_mode` y `referencia_awaiting_lookup_retry`, en ambos canales. Si vencen, pide verificar de nuevo antes de continuar. `referencia_lookup_pending` espera MINSA y no se interrumpe; `referencia_closed` es terminal.

En `referencia_awaiting_other_reference`, **Sí** también exige renovar la sesión vencida antes de recuperar las referencias. **No, salir** cierra directamente con la despedida, sin exigir otro OTP para abandonar la conversación. Si llega una respuesta desconocida con la sesión vencida, la reverificación vuelve a la misma pregunta, sin mostrar el listado hasta recibir **Sí**. Las respuestas a botones antiguos siguen sujetas al control de interacción vigente.

Si se pulsa **Cambiar referencia** con la sesión vencida, esa intención se conserva: primero se solicita y verifica otro OTP, después se actualizan las referencias y se recupera el listado. No se consulta disponibilidad ni se reserva con el token vencido. Si la reverificación se debe a otro mensaje durante fechas u horarios, se conserva la reanudación habitual de ese paso. El estado antiguo de confirmación de referencia sigue admitiendo la salida y el cambio para las sesiones que ya lo tenían guardado.

## Cancelar y límites

- En los pasos de documento y OTP, en la lista, en la confirmación de la referencia y en la oferta de cita vale la salida voluntaria de cita («quiero salir»), que pide confirmación con un texto propio de referencias; al confirmar, la sesión se cierra y se limpia el propósito. Un insulto en esos pasos recibe el recordatorio de respeto y se repite la pregunta.
- El servicio depende de que el backend publique `/whatsapp/api/v1/references` y de `SANDBOX_USE_REAL_MINSA=true`. Sin una de las dos, la respuesta siempre es «No cuentas con referencias registradas.» y se ofrece agendar una cita. Las demos (DNI `10308523` y `47391441`) son la única excepción, pero igual exigen iniciar sesión.
- Las sesiones guardadas en `cita_references_pending` o `cita_awaiting_references_offer` (estados que ya no existen) no se migran y fallan al responder. Solo importa si existe una base de datos con sesiones en esos estados; la base de desarrollo parte limpia.

## Lo que todavía no hace

- Un mensaje con la palabra exacta «referencia» que no es un pedido corto recibe la elección de OOS-03 (Consultar referencia / Agendar cita) antes de llegar a la IA, así que la intención `referencia` de la IA solo ve los textos sin esa palabra (mal escrita, «derivación»).
- El mensaje de sesión vencida dice «tu cita» aunque la persona venga de consultar una referencia.
- No hay nada más que hacer con una referencia que reservar una cita con ella.

## Validación de la elección cuando faltan cupos

El cambio del 21 de octubre de 2026 completó **3.467 pruebas Vitest aprobadas, ninguna fallida y 13 omitidas**. Incluye 18 pruebas HTTP de web y 24 de WhatsApp con MINSA y Meta simulados: pregunta antes de mostrar el listado, botones y texto, cambio de hospital/UPS, despedida y limpieza de datos, protección contra botones antiguos y comienzo de otra conversación con un saludo. TypeScript, formato completo, lint de los archivos cambiados y 17 pruebas aisladas de rendimiento pasaron. La reverificación conserva la pregunta si todavía no se respondió Sí. Se mantuvo operativo el demo local; no se modificó Python ni se publicaron cambios.

## Validación anterior de la extensión a WhatsApp

La entrega local del 21 de octubre de 2026 completó **3.405 pruebas Vitest aprobadas, ninguna fallida y 13 omitidas**, con TypeScript, ESLint y formato completos aprobados. Las 15 pruebas de `tests/security/whatsapp-reference-contract.test.ts` recorren firma, FSM, adaptadores y entrega Graph con los servicios externos simulados: modalidad tras OTP, elección directa, cuotas y códigos, cambio desde tres pasos, paginación completa, confirmación final y respaldo de texto ante HTTP 400. Las 17 pruebas aisladas de rendimiento pasaron.

No se enviaron mensajes a Meta ni se consultaron cupos o reservaron citas en MINSA real. No se modificaron esquemas, migraciones ni `.env`, y no hubo commits ni publicaciones. La migración Python se adapta por separado, conservando congelado su oráculo histórico. Ver los resultados y límites de cada comprobación en [la guía de QA](qa/guia-pruebas-manuales.md).
