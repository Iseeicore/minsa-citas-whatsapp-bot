# Flujo de cita: árbol de ramificaciones

Mapa de cada paso del flujo de cita: qué envía el bot (lista, botones o texto), qué texto libre entiende, qué pasa con varias coincidencias y cada rama de error. Sirve para QA, para el diseño de conversaciones y para ubicar un bug. Refleja el código de `lib/fsm/` en la rama de trabajo local.

## Leyenda

| Símbolo | Qué envía el bot |
|---|---|
| 📋 **LISTA** | Lista de WhatsApp con hasta 10 filas: título ≤24 y descripción ≤72. La cita nueva conserva páginas de 10; referencias reales y su disponibilidad usan 7 opciones más los controles de página/cambio de la misma lista. |
| 🔘 **BOTONES** | Botones de respuesta rápida (1 a 3) |
| 🔗 **CTA** | Mensaje con un botón que abre una URL |
| 💬 **TEXTO** | Mensaje de texto simple |
| 🤖 **IA** | El paso puede consultar a la IA (ver [Dónde interviene la IA](#dónde-interviene-la-ia)) |
| ⛔ | Estado terminal: el siguiente mensaje vuelve al primer contacto |

## Árbol del flujo correcto

```
Primer mensaje
├─ saludo o vacío ─────────────► 🔗 bienvenida ─► main_menu
├─ "1" / "cita" ───────────────► 💬 pide documento
├─ "referencia" / "quiero consultar mi referencia"
│                               ► 💬 pide iniciar sesión (servicio propio: flujo-referencias.md)
├─ pide cita con especialidad o distrito ("cita de pediatría en SJL")
│                               ► 💬 pide documento (guarda las pistas)
├─ urgencia ───────────────────► ⛔ corte de emergencia (106 / 116)
├─ menciona la referencia sin pedirla ("¿Ya aceptaron mi referencia?", OOS-03)
│                               ► 🔘 [Consultar referencia] (pide iniciar sesión) / [Agendar cita] (pide documento)
├─ fuera de alcance ───────────► 💬 mensaje del canal oficial
└─ otro texto ─────────────────► 📋 menú (Agendar cita / Consultar Referencias / incidencias con la bandera)

main_menu 📋 ── texto libre sin coincidencia ──► 🤖 intención
                                                ├─ cita ─────────► pide documento
                                                ├─ referencia ───► Consultar Referencias (pide iniciar sesión)
                                                ├─ fuera_de_alcance ─► 💬 texto fijo + 📋 menú
                                                └─ no claro / IA caída ─► 📋 menú

Documento 💬  (8 dígitos: DNI "01" · 9 dígitos: carnet de extranjería "03")
└─ válido ─► MINSA valida  (envía numero_documento, tipo_documento y conversation_id)
   ├─ registrado ─► 💬 "Te enviamos un código…" ─► OTP
   │                └─ correcto ─► consulta referencias (web y WhatsApp) ─► modalidad o nueva cita
   └─ no registrado ─► 💬 "No encontramos tu documento en MINSADIGITAL. Si aún no tienes cuenta, regístrate en la plataforma; el registro puede tardar unos minutos en reflejarse."
                       + 🔗 MINSADIGITAL + 🔘 [Ya me registré]  (máx. 3 intentos ⛔)

Distrito 💬 🤖
├─ búsqueda local (sin IA) ─┐
├─ si no, IA ───────────────┤
│                           ├─ 1 permitido ────► busca ubigeo
│                           ├─ 2–10 ───────────► 📋 "¿Cuál es tu distrito?"
│                           ├─ más de 10 ──────► 💬 modo manual (depto → prov → distrito)
│                           └─ solo fuera de los departamentos permitidos ─► 🔗 MINSA Digital ⛔
Ubigeo ── 1 ─► sigue │ 2–10 ─► 📋 "Selecciona tu ubigeo:"

Especialidad 📋 🤖   (se salta si la pista de especialidad coincide con una sola)
Establecimiento 📋 🤖 (1 resultado ─► se elige solo)
Fecha 📋 🤖          (1 fecha ─► se elige sola)
   └─ el establecimiento no tiene fechas ─► se descarta y se buscan otros
      ├─ queda 1 ───► 🔘 "¿Quieres buscar en *Y*?"
      ├─ quedan varios ─► 💬 + 📋 establecimientos restantes
      └─ no queda ninguno ─► 🔘 ¿otro distrito cercano?
Hora 📋              (1 horario ─► 🔘 "Solo hay un horario… ¿Lo confirmas?")
   │                   (horarios idénticos del MINSA, mismo inicio y fin, cuentan como uno solo)
   ├─ toque en la lista ───────────► reserva directa
   └─ hora escrita ("8 y 45") ─────► 🔘 "¿Confirmas el horario…?" ─► reserva

Reserva 💬 "Agendando tu cita…"
├─ éxito ─► 💬 constancia + 🔗 "Ver mi cita" + 💬 despedida ⛔
├─ servicio caído (HTTP 5xx) ─► 💬 "En este momento el servicio tiene problemas…" ⛔ (sin volver a los horarios)
└─ error 4xx o cupo tomado ─► 💬 aviso + horarios de la misma fecha (hasta 3 veces)
```

Un error 5xx de MINSA al reservar significa que el servicio no está respondiendo, así que reintentar no sirve: el bot cierra con el aviso y no vuelve a mostrar los horarios. Un 4xx o un cupo tomado sí reintenta, porque otra hora puede funcionar. Un duplicado se reconoce por el mensaje de MINSA aunque llegue como 500.

### Elección de cita nueva o con referencia en ambos canales

En WhatsApp y en el Chat-bot web, después del OTP se consultan las referencias antes de usar las pistas de distrito o especialidad del mensaje inicial. Las referencias reales comparten este recorrido en ambos canales; las demos conservan sus pasos anteriores:

```text
OTP → consultar referencias → Nueva cita / Cita con referencia
Cita con referencia → elegir referencia → fechas → horario → resumen → confirmar reserva
                                         └──────── Cambiar referencia ──────► listado
Sin fechas con cupos → ¿Deseas continuar con tus referencias o con una cita médica? → Referencias: listado / Cita médica: cita nueva
```

1. Con resultado interno `found` y referencias, el estado `referencia_awaiting_appointment_mode` ofrece **Nueva cita** y **Cita con referencia**. MINSA devuelve un arreglo raíz, sin exigir `status_reference`; el adaptador determina ese resultado interno. Si la referencia elegida no tiene cupos, el bot pregunta «No encontramos cupos disponibles para esta referencia. ¿Deseas continuar con tus referencias o con una cita médica?» con **Referencias** y **Cita médica**. **Referencias** vuelve al listado; **Cita médica** sigue la cita nueva con la sesión vigente, sin otro OTP y sin los datos de la referencia. También se aceptan respuestas escritas como «referencias», «referencia», «cita», «cita médica», «nueva cita», «1» o «2»; cualquier otra repite la pregunta y «salir» cierra con la despedida como antes. La referencia que se quedó sin cupos queda marcada en la sesión: al volver a la lista aparece bloqueada con la etiqueta «Sin programación» en lugar de su estado (en gris en el Chat-bot, y con «Sin programación» en la descripción de WhatsApp), va con las bloqueadas y, si se elige igual, el bot responde «Esta referencia no tiene programación de atención disponible. Elige otra.» y repite la misma página, sin volver a consultar MINSA. La marca se borra al consultar de nuevo las referencias o al pasar a una cita nueva, y cuenta como no seleccionable: si ya no queda ninguna, se continúa con una cita nueva. Esa pregunta de modalidad solo aparece si al menos una referencia está en estado 3 o 5, los únicos que permiten agendar; el estado 7 (PACIENTE CITADO) se muestra bloqueado. Si MINSA devuelve referencias pero ninguna lo permite, el bot responde «No tienes referencias disponibles para agendar. Continuaremos con una nueva cita.» y continúa como **Nueva cita**, sin preguntar. El mismo criterio aplica al volver a elegir referencia (Cambiar referencia, «Sí» ante la falta de cupos o tras un error técnico): nunca se muestra una lista sin ninguna referencia que se pueda elegir.
2. **Nueva cita** limpia la selección y los datos de referencia y continúa el flujo normal con la identidad verificada. Conserva las pistas del pedido inicial cuando todavía corresponden.
3. **Cita con referencia** muestra tarjetas web con la especialidad o atención primero, el número y estado separados y los datos completos de destino, origen y fecha de referencia. Los nombres largos ocupan varias líneas. Si MINSA no envía la descripción de la especialidad, se indica «Especialidad no informada», conservando su código para la disponibilidad. Los metadatos públicos de presentación no incluyen documento, token ni códigos de integración.
4. Elegir una referencia válida inicia directamente la búsqueda de fechas, sin la pregunta «¿Es esta tu referencia?». Se usan los códigos IPRESS y UPS exactos de esa referencia, sin sustituirlos por nombres ni por los de otra referencia del mismo hospital. Se retiran las pistas iniciales incompatibles. En ambos canales sólo se ofrecen fechas y horarios con `cantidadCupos > 0`. Elegir un horario, tanto con un toque como con texto, muestra el resumen; sólo su confirmación final permite enviar la reserva con `referencia_id`.
5. Con respuesta `empty`, se informa que no hay referencias registradas y continúa la nueva cita sin repetir documento u OTP.
6. Un error, una respuesta no reconocida o `found` sin referencias válidas activa `referencia_awaiting_lookup_retry`. Se ofrece **Reintentar consulta** o **Nueva cita**. Un fallo técnico no se presenta como ausencia de referencias.
7. **Cambiar referencia**, también escribiendo ese texto, vuelve al listado desde fechas, horarios, desambiguación de hora, elección de otra fecha y resumen final. Elimina destino, especialidad, fecha, horarios, selección y contadores de la reserva anterior; conserva identidad y referencias. La siguiente selección consulta los códigos de la nueva referencia. La lista, su paginación y esta acción comparten una única interacción; elegir una fecha u hora sigue siendo posible sin que otro mensaje de botones desactive la lista.

Una referencia incompleta no cambia silenciosamente a otra cita ni permite inventar su destino. El bot informa el problema y vuelve a la elección. Un duplicado de reserva con referencia también vuelve a la elección sin ofrecer otra especialidad ligada al identificador anterior. Si no quedan fechas con cupos, entra en `referencia_awaiting_other_reference` y pregunta «No encontramos cupos disponibles para esta referencia. ¿Deseas seleccionar otra referencia?», con **Sí** y **No, salir**. **Sí** limpia la selección anterior y recupera sus referencias, conservando la identidad; **No** utiliza la despedida de referencias ya existente y termina en `referencia_closed`, sin credenciales, datos de cita ni contadores. El ejecutor conserva únicamente el control interno de la interacción consumida para rechazar botones antiguos. Antes de responder no muestra el listado ni consulta otra disponibilidad. Una respuesta desconocida repite la pregunta. Si no hay horarios disponibles para una fecha, permite buscar otra fecha o cambiar de referencia. Un error técnico al consultar fechas u horarios muestra el aviso de error y recupera el listado; no se presenta como falta de disponibilidad. Estas recuperaciones corresponden a referencias reales en ambos canales.

WhatsApp muestra especialidad primero, con título de hasta 24 caracteres y descripción de destino, número, fecha y estado de hasta 72; número, fecha y estado quedan completos y se acorta el destino con «…» (el estado solo como último recurso). Referencias y disponibilidad se paginan en grupos de 7 opciones; los controles de página y **Cambiar referencia** son filas de la misma lista Graph. Hasta 7 opciones y 3 controles respetan el máximo de 10 filas y conservan una sola interacción vigente. La confirmación final tiene como máximo 3 botones. El respaldo de texto ante HTTP 400 de Graph conserva la navegación y el cambio sin numerarlos como opciones reservables; admite escribir sus títulos.

La sesión se comprueba también en los estados nuevos de elección y reintento. Al verificar de nuevo se vuelve a consultar cuando corresponde, mientras una reserva ya encaminada a fechas u horarios recupera ese paso. Si el mensaje que encontró la sesión vencida era **Cambiar referencia**, se conserva esa intención: primero se verifica otro OTP y después se actualiza el listado, sin consultar con el token vencido. Los botones de mensajes anteriores siguen sujetos al control de interacción vigente.

El servicio separado [Consultar Referencias](flujo-referencias.md) mantiene su entrada. La referencia aporta destino y especialidad; la API de reserva sigue necesitando una fecha de cita y una hora. Si sólo existe una fecha disponible, el comportamiento actual la informa y continúa al horario.

## Paso a paso: qué envía y qué texto libre entiende

| Paso | El bot envía | Texto libre que entiende | Varias coincidencias | IA |
|---|---|---|---|---|
| Bienvenida | 🔗 CTA "Continuar mi cita" | saludo, "1"/"2", "cita", pedido con especialidad o distrito | — | no |
| Menú principal | 📋 filas de los servicios (cita; referencia; incidencias con la bandera) | número de fila, "cita", "referencia", "reclamo", "incidencia", frases de cita | — | 🤖 intención |
| Documento | 💬 | 8 dígitos (DNI) o 9 dígitos (carnet de extranjería); el largo decide el tipo | — | no |
| Registro pendiente | 🔗 + 🔘 [Ya me registré] | nada (solo el botón) | — | no |
| OTP | 💬 | 4 a 8 dígitos | — | no |
| Distrito | 💬 | nombre del distrito; "sí"/"ese" reutiliza el primer mensaje | 📋 de desambiguación (2–10) | 🤖 distrito |
| Desambiguación de distrito | 📋 ≤ 10 | posición ("2", "segunda"), nombre, provincia o departamento; un lugar nuevo inicia otra búsqueda | 📋 reducida | solo si inicia otra búsqueda |
| Modo manual (depto → prov → distrito) | 💬 | cualquier texto | — | no |
| Ubigeo | 📋 2–10 | posición o nombre | 📋 reducida | no |
| Especialidad | 📋 paginada (título corto; descripción: nombre completo · cupos) | posición, ordinal, nombre corto o completo | 📋 reducida | 🤖 pistas (texto de 5+ letras) |
| Sin cobertura | 🔘 [Sí, otro distrito] [No, salir] | sí/no, "cambiar", "otro distrito", un nombre de lugar | — | solo si inicia otra búsqueda |
| Establecimiento | 📋 ≤ 10 (título abreviado; descripción: nombre completo · cupos) | posición, ordinal, nombre corto o completo | 📋 reducida | 🤖 pistas |
| Fecha | 📋 paginada | "22/09", "22 de septiembre", "hoy", "mañana", "martes", "el 22", "lo más pronto", posición | 📋 reducida (varios martes, varios "22") | 🤖 fecha (frases temporales) |
| Hora | 📋 ≤ 10 por página + 🔘 [Ver más horarios] | "8:45", "8 y 45", "8 y media", "a las 3 de la tarde", "mediodía", "lo más temprano", posición | 📋 reducida; "1".."10" ambiguo → 🔘 2 opciones | no |
| Elección de hora ambigua | 🔘 2 opciones | la hora escrita otra vez | 📋 reducida | no |
| Confirmación de hora | 🔘 [Sí, confirmar] [No…] | "sí", "ok", "dale", "confirmo", "esa", "me sirve", la misma hora | — | no |
| Otra fecha | 🔘 [Sí, otra fecha] [No, salir] | sí/no, "cambiar", "otra fecha", "otro día" | — | no |
| Otro establecimiento | 🔘 [Sí, buscar ahí] [No, salir] | sí/no ("sí", "dale", "no", "salir") | — | no |
| Confirmar salida | 🔘 [Sí, salir] [No, continuar] | "sí", "salir", "quiero salir" / "no", "continuar", "seguir" | — | no |
| Reserva | 💬 "Agendando tu cita…" | — | — | no |
| Reverificación | 🔘 [Sí, enviar código] [Cancelar] | sí/no | — | no |

### Cómo se resuelve un texto escrito en una lista
Todos los pasos con 📋 siguen el mismo orden (`lib/fsm/flows/cita/selection.ts`):
1. **Toque en una fila** → se acepta solo si la fila pertenece a la lista ofrecida.
2. **Reconocedor propio del paso**, si tiene uno: fechas (`matchFechaText`) y horas (`matchHoraText`).
3. **Posición u ordinal:** "1", "uno", "primera", "última"; también con relleno ("quiero la opción 2").
4. **Palabras del título:** una palabra de 4 letras o más también coincide por prefijo.
5. **Resultado:**
   - **una fila** → se elige;
   - **empate** → 📋 *"Encontramos varias coincidencias. Selecciona una:"* con solo esas filas;
   - **ninguna** → IA (si el paso la usa) o *"Selecciona una opción de la lista."* y la lista otra vez.

## Ramas de error

### Escribió mal o se equivocó

| Dónde | Qué escribió | Respuesta | Sigue en |
|---|---|---|---|
| Documento | no son 8 ni 9 dígitos | *"Documento inválido. Debe tener 8 dígitos (DNI) o 9 dígitos (carnet de extranjería). Intenta de nuevo."* (sin límite) | Documento |
| OTP | formato inválido (letras, símbolos, mensaje muy corto o largo, o un toque de botón) | *"Código incorrecto. Te quedan {2\|1} intento(s)."* (cuenta como intento y no consulta a MINSA) | OTP; al 3.º ⛔ *"Superaste el número de intentos permitidos…"* |
| OTP | código incorrecto | *"Código incorrecto. Te quedan {2\|1} intento(s)."* | OTP; al 3.º ⛔ *"Superaste el número de intentos permitidos…"* |
| Distrito | texto sin sentido | *"No reconocimos ese distrito. Por favor escribe el nombre de tu distrito o comuna:"* | Distrito |
| Distrito | la IA no lo encuentra | 1.ª vez: el mismo texto; 2.ª vez: modo manual | Distrito → modo manual |
| Cualquier lista | no coincide con nada | *"Selecciona una opción de la lista."* + lista | la misma lista |
| Fecha | fecha válida sin cupos | *"No hay cupos para {fecha}. Elige una de las fechas disponibles:"* + lista | Fecha |
| Hora | hora válida sin cupos | *"No hay horarios disponibles a esa hora. Elige uno de la lista:"* + lista | Hora |
| Confirmaciones | respuesta no reconocida | se repiten los mismos botones (sin límite) | el mismo paso |

### Cambió de opinión

| Dónde | Respuesta del ciudadano | Resultado |
|---|---|---|
| Confirmación de hora | "no", "otro horario", "ver horarios" | *"Sin problema. Elige otro horario:"* + lista |
| Confirmación del único horario | "no" | 🔘 *"…te recomiendo elegir otra fecha. ¿Deseas cambiar de fecha?"* |
| Otra fecha | "sí" | busca otras fechas y excluye las ya rechazadas |
| Otra fecha / otro distrito | "no", "salir" | ⛔ despedida |
| Cita duplicada | "sí", "otra especialidad", "cambiar" | vuelve a listar especialidades sin la que ya tiene cita |
| Cita duplicada | "no", "salir" | ⛔ despedida (`cita_booking_duplicate`) |
| Sin cobertura | un nombre de distrito | nueva búsqueda de distrito |
| Otro establecimiento | "sí" / "no", "salir" | busca fechas en el propuesto / ⛔ despedida |

### Quiere salir
En los pasos de documento, OTP, registro pendiente, distrito, modo manual y en todas las listas, una frase clara de abandono pide confirmación antes de cerrar:

- **Local, sin costo:** "quiero salir", "salir", "ya no quiero nada", "no quiero seguir", "me aburrí", "olvídalo", "déjalo", "cancela la cita", "me cansé"…
- **Con la IA:** en distrito, pistas de especialidad o establecimiento y fecha, la IA también marca `quiere_salir` ("puff, muchos pasos").
- **No se activa con:** "no" o "cancelar" solos, nombres de lugar, ni frases como "no quiero esa fecha". Tampoco en los pasos de sí/no (otra fecha, otro distrito, otro establecimiento, confirmación de hora, cita duplicada, reverificación), donde "no" y "salir" ya tienen su propio sentido.

| Respuesta | Resultado |
|---|---|
| (se detecta) | 🔘 *"Parece que prefieres no continuar con tu cita. Entiendo que pueda ser frustrante. ¿Deseas salir?"* [Sí, salir] [No, continuar] |
| Sí | ⛔ *"Entendido. Cuando quieras retomar tu cita, escríbenos. ¡Que tengas un buen día! 👋"* La sesión termina (`cita_abandoned`) y el siguiente mensaje es un primer contacto. |
| No | vuelve al mismo paso y repite su pregunta (o la lista) |

Si la sesión venció mientras el ciudadano estaba en esta pregunta, **primero** aparece la alerta de sesión expirada (ver abajo); al reverificar, vuelve al paso donde estaba antes de preguntarle si quería salir.

> **No hay comandos "menú" o "reiniciar" a mitad del flujo.** Para salir se usa la salida voluntaria, o se llega a un estado terminal.

### La IA se cayó o tardó más de 8 s

| Punto | Qué ve el ciudadano |
|---|---|
| Menú | el menú (el turno registra `menu_fallback`) |
| Distrito | modo manual: *"No pudimos identificar tu distrito en este momento. Vamos por partes: indícanos el departamento donde buscas atención."* |
| Especialidad / establecimiento | *"No pudimos identificar esa opción. Selecciona una opción de la lista."* + lista |
| Fecha | *"No pudimos identificar esa fecha. Selecciona una opción de la lista."* + lista |

### La sesión expiró

**Por inactividad o token vencido:**
- **Dónde aplica:** en los pasos posteriores al OTP que esperan una respuesta del ciudadano, incluida la pregunta "¿Deseas salir?" hecha en uno de esos pasos.
- **Qué la dispara:** más de 10 min sin actividad, o que el token del MINSA venza en menos de 30 s.
- **Qué envía el bot:**
  - 🔘 *"⏳ Tu sesión ha expirado por inactividad. Por tu seguridad, necesitamos confirmar nuevamente tu identidad para continuar con tu cita. ¿Deseas solicitar un nuevo código de verificación?

[1] Sí, enviar código
[2] Cancelar"* con [Sí, enviar código] [Cancelar].
  - El mensaje que llegó en ese momento **no se procesa**. En una referencia real de ambos canales se conserva la intención explícita **Cambiar referencia**, para recuperar el listado sólo después de verificar otro OTP.
- **Qué pasa después:**
  - **Sí** → nuevo OTP y el flujo retoma donde estaba.
  - **Cancelar** → 🔘 *"Parece que prefieres no continuar con tu cita… ¿Deseas salir?"*: **Sí** cierra la cita (`cita_abandoned`); **No** vuelve a mostrar la alerta.

**Por un 401 del MINSA a mitad del flujo:**
- **Qué envía el bot:** 💬 *"Tu verificación anterior expiró por inactividad. No te preocupes, no perdimos los datos de tu cita — ingresa tu número de documento para continuar justo donde quedaste."*
- **Cómo retoma:** después del OTP, con *"¡Listo! Continuemos con tu cita. Buscando…"*.
- **Excepción:** si el 401 llega durante la reserva, retoma en la lista de horarios, así que hay que elegir de nuevo.

**Sin base de datos:** la sesión se borra de memoria tras 1 h sin actividad, y el siguiente mensaje cuenta como primer contacto.

### Cita en el mismo día
- **Se permite:** la fecha de hoy puede aparecer en la lista.
- **Horarios de hoy:** solo se ofrecen los que empiezan **después de la hora actual de Lima**, sin margen mínimo.
- **Si ya no queda ninguno hoy:** 🔘 *"No hay horarios disponibles para esa fecha. ¿Deseas cambiar de fecha?"*.
- **Mensaje propio:** el bot no tiene un texto para el "mismo día". Si el MINSA rechaza la reserva por una regla de mismo día, el ciudadano ve **el mensaje del MINSA tal cual** y el flujo termina ⛔.

### Error al registrar la cita

La tabla describe el recorrido general. En una referencia real de ambos canales, un duplicado vuelve a la elección de modalidad y un error técnico de consulta de fechas u horarios recupera el listado con un aviso. Nunca cambia automáticamente el establecimiento o la especialidad asociados a la referencia.

| Qué respondió el MINSA | Respuesta | Sigue en |
|---|---|---|
| Ya tiene una cita activa (una por especialidad) | 🔘 *"Ya tienes una cita activa para {especialidad}. El MINSA permite una sola cita activa por especialidad. ¿Deseas intentar con otra especialidad?"* [Otra especialidad] [No, salir] | Especialidad (sin la ya reservada; si no queda ninguna, ¿otro distrito?) |
| Error técnico (HTTP) | *"Tuvimos un problema técnico al intentar reservar tu cita. Vamos a intentarlo de nuevo — estos son los horarios disponibles de la misma fecha:"* | Hora (misma fecha) |
| Horario tomado ("cupo", "agotado", "ocupado"…) | *"No pudimos reservar ese horario, puede que otra persona lo haya tomado justo antes. Te muestro los horarios disponibles de la misma fecha:"* | Hora (misma fecha) |
| 3.ª falla seguida | el mensaje del MINSA, o *"No pudimos agendar tu cita. Intenta de nuevo más tarde."* | ⛔ |
| Otro rechazo con mensaje | el mensaje del MINSA tal cual | ⛔ |
| Error al buscar especialidades, establecimientos, fechas u horarios | *"Ocurrió un error al buscar {…} disponibles. Intenta iniciar tu cita nuevamente en unos minutos."* | ⛔ |

### Sin cobertura

En referencias reales de ambos canales no se buscan otros establecimientos para el mismo identificador: se conserva el IPRESS/UPS de destino y se permite elegir otra referencia. Las reglas siguientes corresponden a la búsqueda general de una cita nueva.
- **Sin especialidades o establecimientos:** 🔘 *"No encontramos … disponibles … ¿Deseas buscar en otro distrito cercano?"* con [Sí, otro distrito] [No, salir].
- **Establecimientos paginados por el MINSA:** se piden de 5 en 5 (`page_size: 5`). Si hay más páginas, la lista termina con las filas «Ver más establecimientos» y «Ver anteriores», que vuelven a consultar la página siguiente o anterior. Un único resultado solo se elige solo cuando es el único de todas las páginas, y al descartar los de una página por falta de fechas el bot sigue con la siguiente antes de ofrecer otro distrito.
- **Cambio de ubicación a mitad de la lista:** en las listas de especialidad y de establecimiento, frases como «ya no quiero esta ubicación» u «otro distrito» (o la IA) preguntan [Sí, otro distrito] [No, salir]; el sí borra los datos ligados al distrito y pide el nuevo.
- **Especialidad pedida no disponible:** si la especialidad dicha al inicio no está en la lista del MINSA, el bot avisa «La especialidad que mencionaste (X) no está disponible por ahora, pero puedes elegir entre estas:» y muestra las demás.
- **Sin fechas en el establecimiento elegido** (sin fechas rechazadas antes): se descarta y se vuelven a pedir los establecimientos sin él.
  - **Queda uno:** 🔘 *"No hay fechas disponibles en {X}. ¿Quieres buscar en {Y}?"* [Sí, buscar ahí] [No, salir].
  - **Quedan varios:** 💬 *"No hay fechas disponibles en {X}. Estos establecimientos también atienden {especialidad}:"* + 📋 lista.
  - **No queda ninguno:** la pregunta de otro distrito cercano.

## Interrupciones globales (en cualquier paso)

| Interrupción | Dónde aplica | Efecto |
|---|---|---|
| **Urgencia** ("no puedo respirar", "dolor de pecho", "ambulancia"…) | todos los estados (a mitad del flujo, textos de hasta 120 caracteres) | ⛔ corta el flujo: *"⚠️ ESTE CANAL NO ATIENDE EMERGENCIAS MÉDICAS…"* (SAMU 106, Bomberos 116) |
| **Salida voluntaria** ("quiero salir", "me aburrí"…) | documento, OTP, registro, distrito, modo manual y listas | pide confirmación; Sí termina la sesión, No vuelve al paso |
| **Insultos** (guardia léxica) | menú, listas y pasos de texto libre del distrito | aviso de respeto y **conserva el paso** (vuelve a mostrar la lista o la pregunta) |
| **Fuera de alcance** | solo en el primer contacto y en el menú | mensaje del canal oficial correspondiente |
| **Mensajes demasiado rápidos** | antes del flujo | más de 5 en 10 s: *"Está enviando mensajes muy rápido…"* (2 min); más de 20 en 60 s: se ignoran por 1 h. El paso se conserva |
| **Falla inesperada** | cualquier turno | *"Ocurrió un inconveniente temporal…"* (uno cada 30 s); el paso no avanza |

## Dónde interviene la IA
Cuatro puntos, y en todos primero corre la lógica local; la IA solo entra cuando esa lógica no alcanza:
1. **Menú:** texto libre sin coincidencia → intención (`cita`, `referencia`, `incidencia` con la bandera, `fuera_de_alcance`, `unclear`).
2. **Distrito:** la búsqueda local no encontró nada.
3. **Especialidad y establecimiento:** texto de 5 letras o más que no coincide con la lista.
4. **Fecha:** frase temporal ("la próxima semana", "a fin de mes").

Mientras la IA responde, el ciudadano ve "escribiendo…"; si tarda más de 8 s, entra el respaldo de la tabla anterior.

## Horas y alcance del piloto
- **Horas en 12 h:** el ciudadano ve los rangos como *8:00 - 8:15 AM*, *1:00 - 1:15 PM* o *11:45 AM - 12:00 PM* (listas, lista reducida, horario único, confirmación y la elección entre posición y hora). Al MINSA se sigue enviando 24 h (`08:00|08:15`), y el bot entiende horas escritas en 12 h o 24 h.
- **Departamentos permitidos:** los define `CITA_ALLOWED_DEPARTAMENTOS` (por ejemplo `LIMA`). Vacía o sin definir = sin filtro: el agendamiento queda libre para todo el país (no hay valor por defecto en el código). El filtro aplica a la búsqueda por nombre, a las pistas del primer mensaje y al modo manual (departamento → provincia → distrito). En el modo manual, un departamento escrito fuera de la lista recibe de inmediato el aviso de etapa inicial con el enlace a MINSA Digital, sin consultar a MINSA; «Lima Metropolitana» o «Lima Provincias» se aceptan cuando `LIMA` está permitido.
- **Botones de enlace:** ni WhatsApp ni el Chat-bot muestran un subtexto bajo el botón del enlace; solo su etiqueta (por ejemplo, *Ir a MINSADIGITAL*).
- **Fechas del MINSA:** "hoy" y "fin de mes" se calculan con el reloj de Lima, no con el del servidor.

## Nombres de especialidad y establecimiento en las listas

El MINSA entrega nombres largos (por ejemplo `CONSULTA EXTERNA-MEDICINA GENERAL / ATENCIÓN DEL ADULTO-`). `lib/fsm/flows/cita/catalog-names.ts` los limpia sin IA, con reglas fijas:

| Dato | Especialidad | Establecimiento |
|---|---|---|
| Nombre del MINSA | `CONSULTA EXTERNA-MEDICINA GENERAL / ATENCIÓN DEL ADULTO-` | `HOSPITAL NACIONAL HIPOLITO UNANUE` |
| Título de la fila (≤ 24) | `Medicina General` | `Hosp. Nacional Hipolito` |
| Descripción (≤ 72) | `Medicina General / Atención del Adulto · 1312 cupos` | `Hospital Nacional Hipolito Unanue · 12 cupos` |

- Se quita el prefijo `CONSULTA EXTERNA-` y los guiones sobrantes; mayúsculas de título; siglas (`CS`), abreviaturas con punto (`C.S.`) y números romanos (`II`) quedan en mayúscula.
- En establecimientos, el título abrevia Hospital → Hosp., Centro de Salud → C.S., Puesto de Salud → P.S., Centro Materno Infantil → C.M.I.
- Si el nombre completo cabe en el título, la descripción lleva solo los cupos.
- El texto escrito se compara también con la descripción ("atención del adulto" elige esa fila), y los mensajes que nombran la especialidad o el establecimiento usan el nombre completo limpio.
