# Flujo de referencias

Cómo consulta la persona sus referencias médicas con el servicio «Consultar Referencias» y cómo se enlaza con la cita. Código en `lib/fsm/flows/referencia/`; reutiliza los pasos de identidad y de selección de referencia de cita, que tiene su propio árbol en [flujo-cita.md](flujo-cita.md). Para el servicio hermano de incidencias, ver [flujo-incidencia.md](flujo-incidencia.md).

## Entradas

No lleva bandera: está siempre disponible. La lógica, la fila del menú y la numeración son las mismas en whatsapp-bot y en el Chat-bot.

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
entrada ─► iniciar sesión (documento + OTP) ─► consulta por documento ─┬─ con referencias ─► lista ─► detalle ─► reserva con esa referencia
                                                                       └─ sin referencias ─► «¿Deseas agendar una cita?» ─┬─ Sí ─► cita (sin pedir documento ni código)
                                                                                                                         └─ No ─► despedida ⛔
```

1. **Entrada.** El bot responde «Para consultar tu referencia debes iniciar sesión. Ingresa tu número de documento.» y marca en la sesión el propósito `referencias` (`postLoginFlow`). No se pide ningún código de referencia: el backend solo lista por documento.
2. **Identidad.** Son los pasos de la cita, sin duplicarlos: documento (DNI o carnet de extranjería) → validación en MINSA → OTP → verificación. Los errores y los límites (3 intentos de OTP, registro pendiente) son los de cita. Al verificarse, el propósito decide el siguiente paso: con `referencias` se consultan las referencias; sin propósito (la cita) se pasa directo al distrito.
3. **Consulta.** Estado `referencia_lookup_pending`: se consulta `/whatsapp/api/v1/references` con el número y el tipo de documento (`lib/integrations/minsa/references.ts`).
4. **Con referencias** (`found`). Se muestra la lista «Estas son tus referencias:», con el destino como título (hasta 24 caracteres) y la fecha en 12 horas y el origen como descripción; más de 10 se paginan como cualquier lista. Al elegir una se muestra el detalle con «¿Es esta tu referencia?» y los botones **Sí** / **No, ver otra**.
   - **Sí:** se buscan fechas en el establecimiento y la especialidad de la referencia, sin preguntar distrito, y se sigue por el flujo de cita hasta reservar enviando `referencia_id`. Si la referencia llegó sin los códigos de destino, la cita continúa desde el distrito.
   - **No, ver otra:** vuelve la lista.
5. **Sin referencias** (`empty`, `error`, cualquier otro estado, o `found` sin ninguna referencia válida). El bot dice «No cuentas con referencias registradas.» y pregunta «¿Deseas agendar una cita?» con **Sí** / **No** (estado `referencia_awaiting_cita_offer`).
   - **Sí:** sigue la cita con la identidad ya verificada: pide el distrito, no vuelve a pedir documento ni código.
   - **No:** «Entendido. Cuando necesites consultar una referencia o agendar una cita, escríbenos. ¡Que tengas un buen día!» y la sesión termina (`referencia_closed`); el siguiente mensaje empieza de nuevo.
   - Una respuesta que no se entiende repite los botones.

## Sesión vencida

Los estados que esperan una respuesta de una persona ya verificada vigilan la inactividad (más de 10 minutos) y el vencimiento del token (menos de 30 segundos): `referencia_awaiting_cita_offer`, `cita_awaiting_referencia_select` y `cita_awaiting_referencia_confirm`. Si vencen, el bot pide verificar de nuevo con el mensaje de sesión expirada de cita; al verificar, vuelve a consultar las referencias. `referencia_lookup_pending` espera la respuesta de MINSA y no se interrumpe, y `referencia_closed` es terminal.

## Cancelar y límites

- En los pasos de documento y OTP, en la lista, en la confirmación de la referencia y en la oferta de cita vale la salida voluntaria de cita («quiero salir»), que pide confirmación con un texto propio de referencias; al confirmar, la sesión se cierra y se limpia el propósito. Un insulto en esos pasos recibe el recordatorio de respeto y se repite la pregunta.
- El servicio depende de que el backend publique `/whatsapp/api/v1/references` y de `SANDBOX_USE_REAL_MINSA=true`. Sin una de las dos, la respuesta siempre es «No cuentas con referencias registradas.» y se ofrece agendar una cita. Las demos (DNI `10308523` y `47391441`) son la única excepción, pero igual exigen iniciar sesión.
- Las sesiones guardadas en `cita_references_pending` o `cita_awaiting_references_offer` (estados que ya no existen) no se migran y fallan al responder. Solo importa si existe una base de datos con sesiones en esos estados; la base de desarrollo parte limpia.

## Lo que todavía no hace

- Un mensaje con la palabra exacta «referencia» que no es un pedido corto recibe la elección de OOS-03 (Consultar referencia / Agendar cita) antes de llegar a la IA, así que la intención `referencia` de la IA solo ve los textos sin esa palabra (mal escrita, «derivación»).
- El mensaje de sesión vencida dice «tu cita» aunque la persona venga de consultar una referencia.
- No hay nada más que hacer con una referencia que reservar una cita con ella.
