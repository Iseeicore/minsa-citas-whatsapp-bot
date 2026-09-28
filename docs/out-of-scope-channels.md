# Canales de derivación: lista de verificación

Los mensajes de consultas fuera de alcance (`lib/fsm/flows/out-of-scope/out-of-scope-messages.ts`) (incluido el de urgencias, que cierra la conversación) mandan al ciudadano a teléfonos y enlaces oficiales. **Todos vienen de la hoja «Matriz de Derivación» del Excel de auditoría y ninguno se ha confirmado con la institución.** Un número equivocado en una urgencia es el peor caso, así que esta lista debe cerrarse antes de que el canal llegue a los ciudadanos.

## Dónde se cambia un valor

Un solo archivo: `lib/fsm/flows/out-of-scope/out-of-scope-channels.ts` (objeto `CHANNELS`). Cambiar el valor ahí actualiza todos los textos que lo mencionan. No hay que tocar los mensajes.

`lib/fsm/flows/out-of-scope/out-of-scope-channels.test.ts` protege esta regla:
- falla si un mensaje escribe un teléfono o un enlace a mano en vez de usar `CHANNELS`;
- falla si un canal de `CHANNELS` no aparece en la tabla de abajo (así ninguno se agrega sin quedar en la lista);
- falla si cambia un texto sin querer: al cambiar un valor a propósito, actualiza también `tests/support/oos-golden.ts`.

## Cómo verificar cada canal

1. Comprobar el valor en la fuente oficial de la institución (página, llamada o aviso vigente).
2. Si es distinto, corregirlo en `CHANNELS` y en `tests/support/oos-golden.ts`.
3. Marcar la casilla y anotar quién lo verificó y cuándo.

## Lista

| # | Canal | Valor en `CHANNELS` | Clave | Aparece en | Qué comprobar | Verificado (quién y fecha) |
|---|---|---|---|---|---|---|
| 1 | SAMU | `106` | `samu` | OOS-01 (mensaje de urgencia, en cualquier paso) | Que 106 sea el número vigente y gratuito | ☐ |
| 2 | Bomberos | `116` | `bomberos` | OOS-01 (mensaje de urgencia, en cualquier paso) | Que 116 sea el número vigente y gratuito | ☐ |
| 3 | Consulta web del SIS | `app.sis.gob.pe/ConsultaWeb` | `sisWeb` | OOS-02 | Que la dirección abra la consulta de afiliación | ☐ |
| 4 | App del SIS | `Asegúrate e Infórmate` | `sisApp` | OOS-02 | Que el nombre de la aplicación sea el vigente | ☐ |
| 5 | WhatsApp del SIS | `941 988 565` | `sisWhatsapp` | OOS-02 | Que el número atienda consultas del SIS por WhatsApp | ☐ |
| 6 | Línea 113, opción del SIS | `Opción 4` | `sisLineOption` | OOS-02 | Que la opción 4 del 113 sea la del SIS | ☐ |
| 7 | Línea 113 (Infosalud) | `113` | `linea113` | OOS-02, OOS-06, OOS-07, OOS-08 | Que 113 sea la línea gratuita de Infosalud | ☐ |
| 8 | Línea 113, opción de vacunación | `Opción 1` | `vaccinationLineOption` | OOS-06 | Que la opción 1 del 113 dé los puntos de vacunación | ☐ |
| 9 | Línea 113, opción de SUSALUD | `Opción 7` | `susaludOption` | OOS-08 | Que la opción 7 del 113 sea la de SUSALUD | ☐ |
| 10 | Observatorio de medicamentos (DIGEMID) | `observatorio.digemid.minsa.gob.pe` | `digemid` | OOS-05 | Que la dirección abra el Observatorio de Productos Farmacéuticos | ☐ |
| 11 | Carnet de vacunación | `carnetvacunacion.minsa.gob.pe` | `carnetVacunacion` | OOS-06 | Que la dirección permita consultar o descargar el carnet | ☐ |

## Datos que no son canales pero también se afirman

Estos datos están dentro de los mensajes, no en `CHANNELS`. Conviene confirmarlos junto con la lista:
- **Ley N° 26842** (reserva de la historia clínica) en OOS-04.
- **Plazo de 30 días hábiles** para responder un reclamo (SUSALUD) en OOS-08.
- **PAUS** (Plataforma de Atención al Usuario) y **ULE** (Unidad Local de Empadronamiento) en OOS-08 y OOS-09.
- Que la vacunación en el primer nivel es **por orden de llegada y sin cita** (OOS-06): por eso ese mensaje no ofrece CITAS.
