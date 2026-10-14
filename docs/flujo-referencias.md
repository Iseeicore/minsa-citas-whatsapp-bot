# Flujo de referencias

Cómo consulta la persona sus referencias médicas con el servicio «Consultar referencia» y cómo se enlaza con la cita. Código en `lib/fsm/flows/referencia/`; reutiliza los pasos de identidad y de selección de referencia de cita, que tiene su propio árbol en [flujo-cita.md](flujo-cita.md). Para el servicio hermano de incidencias, ver [flujo-incidencia.md](flujo-incidencia.md).

## Entradas

No lleva bandera: está siempre disponible. La lógica es la misma en los dos canales; solo cambia cómo se llega.

| Entrada | Canal | Cómo se reconoce | Dónde |
|---|---|---|---|
| Fila «Consultar referencia» | Sandbox | Fila del menú (`consultar_referencia`) o el número `2` | `main-menu.ts`, `first-contact.ts` |
| Palabra clave | WhatsApp y Sandbox | Mensaje corto (hasta 8 palabras) que dice «referencia» o «referencias» y solo lleva palabras de relleno (quiero, deseo, necesito, consultar, ver, revisar, saber, mi, mis, de, la, las, el, estado, médica): «referencia», «quiero consultar mi referencia», «estado de mi referencia». Va **antes** de fuera de alcance | `isReferenciaKeyword` en `menu-shortcuts.ts`; las palabras, en `lib/constants/palabras-clave.ts` |

**WhatsApp no tiene fila ni botón.** Su lista es la de siempre y sus números escritos siguen apuntando a lo mismo: con incidencias encendidas, `1` cita, `2` registrar y `3` consultar una incidencia. En el Sandbox la fila ocupa el segundo lugar:

| Número escrito | WhatsApp | Sandbox |
|---|---|---|
| `1` | Agendar una cita médica | Agendar una cita médica |
| `2` | Registrar una incidencia | Consultar referencia |
| `3` | Consultar una incidencia | Registrar una incidencia |
| `4` | no existe | Consultar una incidencia |

Con `INCIDENCIAS_ENABLED` apagada solo quedan `1` (cita) y, en el Sandbox, `2` (referencia). Los números de las filas apagadas responden que por ahora solo se agenda una cita.

Un mensaje que menciona la referencia sin ser un pedido corto («¿Ya aceptaron mi referencia?», «tengo mi hoja de referencia…», «¿qué es la contrarreferencia?») sigue recibiendo la respuesta de fuera de alcance OOS-03. Esa respuesta ahora termina diciendo que, si la referencia ya está registrada en MINSA Digital, se escriba REFERENCIA.

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

- La IA no tiene una intención «referencia»: se entra por la fila del Sandbox o por palabra clave.
- El mensaje de sesión vencida dice «tu cita» aunque la persona venga de consultar una referencia.
- No hay nada más que hacer con una referencia que reservar una cita con ella.
