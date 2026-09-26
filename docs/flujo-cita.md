# Flujo de cita por WhatsApp: árbol de ramificaciones

Mapa de cada paso del flujo de cita: qué envía el bot (lista, botones o texto), qué texto libre entiende, qué pasa con varias coincidencias y cada rama de error. Sirve para QA, para el diseño de conversaciones y para ubicar un bug. Refleja el código de `lib/fsm/` en `main`.

## Leyenda

| Símbolo | Qué envía el bot |
|---|---|
| 📋 **LISTA** | Lista interactiva de WhatsApp (hasta 10 filas: título ≤ 24, descripción ≤ 72). Con más de 10 opciones se muestra por páginas de 10 con 🔘 [Ver más opciones] / [Anteriores] (*"Mostrando 1 a 10 de N opciones."*); escribir el nombre o el número de una fila de otra página también la elige |
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
├─ pide cita con especialidad o distrito ("cita de pediatría en SJL")
│                               ► 💬 pide documento (guarda las pistas)
├─ urgencia ───────────────────► ⛔ corte de emergencia (106 / 116)
├─ fuera de alcance ───────────► 💬 mensaje del canal oficial
└─ otro texto ─────────────────► 📋 menú (Agendar cita / Registrar reclamo)

main_menu 📋 ── texto libre sin coincidencia ──► 🤖 intención
                                                ├─ cita ─────────► pide documento
                                                ├─ fuera_de_alcance ─► 💬 texto fijo + 📋 menú
                                                └─ no claro / IA caída ─► 📋 menú

Documento (8 dígitos) 💬
└─ válido ─► MINSA valida
   ├─ registrado ─► 💬 "Te enviamos un código…" ─► OTP (4–8 dígitos)
   │                └─ correcto ─► 💬 "¡Verificado! ¿En qué distrito…?"
   └─ no registrado ─► 🔗 MINSADIGITAL + 🔘 [Ya me registré]  (máx. 3 intentos ⛔)

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
Hora 📋              (1 horario ─► 🔘 "Solo hay un horario… ¿Lo confirmas?")
   ├─ toque en la lista ───────────► reserva directa
   └─ hora escrita ("8 y 45") ─────► 🔘 "¿Confirmas el horario…?" ─► reserva

Reserva 💬 "Agendando tu cita…"
└─ éxito ─► 💬 constancia + 🔗 "Ver mi cita" + 💬 despedida ⛔
```

## Paso a paso: qué envía y qué texto libre entiende

| Paso | El bot envía | Texto libre que entiende | Varias coincidencias | IA |
|---|---|---|---|---|
| Bienvenida | 🔗 CTA "Continuar mi cita" | saludo, "1"/"2", "cita", pedido con especialidad o distrito | — | no |
| Menú principal | 📋 2 filas | "1"/"2", "cita", "reclamo", frases de cita | — | 🤖 intención |
| Documento | 💬 | exactamente 8 dígitos | — | no |
| Registro pendiente | 🔗 + 🔘 [Ya me registré] | nada (solo el botón) | — | no |
| OTP | 💬 | 4 a 8 dígitos | — | no |
| Distrito | 💬 | nombre del distrito; "sí"/"ese" reutiliza el primer mensaje | 📋 de desambiguación (2–10) | 🤖 distrito |
| Desambiguación de distrito | 📋 ≤ 10 | posición ("2", "segunda"), nombre, provincia o departamento; un lugar nuevo inicia otra búsqueda | 📋 reducida | solo si inicia otra búsqueda |
| Modo manual (depto → prov → distrito) | 💬 | cualquier texto | — | no |
| Ubigeo | 📋 2–10 | posición o nombre | 📋 reducida | no |
| Especialidad | 📋 paginada | posición, ordinal o nombre | 📋 reducida | 🤖 pistas (texto de 5+ letras) |
| Sin cobertura | 🔘 [Sí, otro distrito] [No, salir] | sí/no, "cambiar", "otro distrito", un nombre de lugar | — | solo si inicia otra búsqueda |
| Establecimiento | 📋 ≤ 10 | posición, ordinal o nombre | 📋 reducida | 🤖 pistas |
| Fecha | 📋 paginada | "22/09", "22 de septiembre", "hoy", "mañana", "martes", "el 22", "lo más pronto", posición | 📋 reducida (varios martes, varios "22") | 🤖 fecha (frases temporales) |
| Hora | 📋 ≤ 10 por página + 🔘 [Ver más horarios] | "8:45", "8 y 45", "8 y media", "a las 3 de la tarde", "mediodía", "lo más temprano", posición | 📋 reducida; "1".."10" ambiguo → 🔘 2 opciones | no |
| Elección de hora ambigua | 🔘 2 opciones | la hora escrita otra vez | 📋 reducida | no |
| Confirmación de hora | 🔘 [Sí, confirmar] [No…] | "sí", "ok", "dale", "confirmo", "esa", "me sirve", la misma hora | — | no |
| Otra fecha | 🔘 [Sí, otra fecha] [No, salir] | sí/no, "cambiar", "otra fecha", "otro día" | — | no |
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
| Documento | no son 8 dígitos | *"Documento inválido. Debe tener 8 dígitos. Intenta de nuevo."* (sin límite) | Documento |
| OTP | no son 4–8 dígitos | *"Código inválido. Debe tener entre 4 y 8 dígitos."* (no cuenta como intento) | OTP |
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

> **No hay comandos "menú", "salir" o "reiniciar" a mitad del flujo.** "salir" o "cancelar" solo funcionan como respuesta *No* en las preguntas de sí/no. Para volver al menú hay que llegar a un estado terminal o cancelar la reverificación.

### La IA se cayó o tardó más de 8 s

| Punto | Qué ve el ciudadano |
|---|---|
| Menú | el menú (el turno registra `menu_fallback`) |
| Distrito | modo manual: *"No pudimos identificar tu distrito en este momento. Vamos por partes: indícanos el departamento donde buscas atención."* |
| Especialidad / establecimiento | *"No pudimos identificar esa opción. Selecciona una opción de la lista."* + lista |
| Fecha | *"No pudimos identificar esa fecha. Selecciona una opción de la lista."* + lista |

### La sesión expiró

**Por inactividad o token vencido:**
- **Dónde aplica:** en los pasos posteriores al OTP que esperan una respuesta del ciudadano.
- **Qué la dispara:** más de 10 min sin actividad, o que el token del MINSA venza en menos de 30 s.
- **Qué envía el bot:**
  - 🔘 *"⏳ Tu sesión ha expirado por inactividad. Por tu seguridad, necesitamos confirmar nuevamente tu identidad para continuar con tu cita. ¿Deseas solicitar un nuevo código de verificación?"* con [Sí, enviar código] [Cancelar].
  - El mensaje que llegó en ese momento **no se procesa**.
- **Qué pasa después:**
  - **Sí** → nuevo OTP y el flujo retoma donde estaba.
  - **Cancelar** → 📋 menú.

**Por un 401 del MINSA a mitad del flujo:**
- **Qué envía el bot:** 💬 *"Tu verificación anterior expiró por inactividad. No te preocupes, no perdimos los datos de tu cita — ingresa tu número de documento (8 dígitos) para continuar justo donde quedaste."*
- **Cómo retoma:** después del OTP, con *"¡Listo! Continuemos con tu cita. Buscando…"*.
- **Excepción:** si el 401 llega durante la reserva, retoma en la lista de horarios, así que hay que elegir de nuevo.

**Sin base de datos:** la sesión se borra de memoria tras 1 h sin actividad, y el siguiente mensaje cuenta como primer contacto.

### Cita en el mismo día
- **Se permite:** la fecha de hoy puede aparecer en la lista.
- **Horarios de hoy:** solo se ofrecen los que empiezan **después de la hora actual de Lima**, sin margen mínimo.
- **Si ya no queda ninguno hoy:** 🔘 *"No hay horarios disponibles para esa fecha. ¿Deseas cambiar de fecha?"*.
- **Mensaje propio:** el bot no tiene un texto para el "mismo día". Si el MINSA rechaza la reserva por una regla de mismo día, el ciudadano ve **el mensaje del MINSA tal cual** y el flujo termina ⛔.

### Error al registrar la cita

| Qué respondió el MINSA | Respuesta | Sigue en |
|---|---|---|
| Ya tiene una cita activa (una por especialidad) | 🔘 *"Ya tienes una cita activa para {especialidad}. El MINSA permite una sola cita activa por especialidad. ¿Deseas intentar con otra especialidad?"* [Sí, otra especialidad] [No, salir] | Especialidad (sin la ya reservada; si no queda ninguna, ¿otro distrito?) |
| Error técnico (HTTP) | *"Tuvimos un problema técnico al intentar reservar tu cita. Vamos a intentarlo de nuevo — estos son los horarios disponibles de la misma fecha:"* | Hora (misma fecha) |
| Horario tomado ("cupo", "agotado", "ocupado"…) | *"No pudimos reservar ese horario, puede que otra persona lo haya tomado justo antes. Te muestro los horarios disponibles de la misma fecha:"* | Hora (misma fecha) |
| 3.ª falla seguida | el mensaje del MINSA, o *"No pudimos agendar tu cita. Intenta de nuevo más tarde."* | ⛔ |
| Otro rechazo con mensaje | el mensaje del MINSA tal cual | ⛔ |
| Error al buscar especialidades, establecimientos, fechas u horarios | *"Ocurrió un error al buscar {…} disponibles. Intenta iniciar tu cita nuevamente en unos minutos."* | ⛔ |

### Sin cobertura
- **Sin especialidades o establecimientos:** 🔘 *"No encontramos … disponibles … ¿Deseas buscar en otro distrito cercano?"* con [Sí, otro distrito] [No, salir].
- **Sin fechas:** 💬 *"No hay fechas disponibles para ese establecimiento."* ⛔ No se ofrece otra fecha ni otro distrito.

## Interrupciones globales (en cualquier paso)

| Interrupción | Dónde aplica | Efecto |
|---|---|---|
| **Urgencia** ("no puedo respirar", "dolor de pecho", "ambulancia"…) | todos los estados (a mitad del flujo, textos de hasta 120 caracteres) | ⛔ corta el flujo: *"⚠️ ESTE CANAL NO ATIENDE EMERGENCIAS MÉDICAS…"* (SAMU 106, Bomberos 116) |
| **Insultos** (guardia léxica) | menú, listas y pasos de texto libre del distrito | aviso de respeto y **conserva el paso** (vuelve a mostrar la lista o la pregunta) |
| **Fuera de alcance** | solo en el primer contacto y en el menú | mensaje del canal oficial correspondiente |
| **Mensajes demasiado rápidos** | antes del flujo | más de 5 en 10 s: *"Está enviando mensajes muy rápido…"* (2 min); más de 20 en 60 s: se ignoran por 1 h. El paso se conserva |
| **Falla inesperada** | cualquier turno | *"Ocurrió un inconveniente temporal…"* (uno cada 30 s); el paso no avanza |

## Dónde interviene la IA
Cuatro puntos, y en todos primero corre la lógica local; la IA solo entra cuando esa lógica no alcanza:
1. **Menú:** texto libre sin coincidencia → intención (`cita`, `fuera_de_alcance`, `unclear`).
2. **Distrito:** la búsqueda local no encontró nada.
3. **Especialidad y establecimiento:** texto de 5 letras o más que no coincide con la lista.
4. **Fecha:** frase temporal ("la próxima semana", "a fin de mes").

Mientras la IA responde, el ciudadano ve "escribiendo…"; si tarda más de 8 s, entra el respaldo de la tabla anterior.

## Horas y alcance del piloto
- **Horas en 12 h:** el ciudadano ve los rangos como *8:00 - 8:15 AM*, *1:00 - 1:15 PM* o *11:45 AM - 12:00 PM* (listas, lista reducida, horario único, confirmación y la elección entre posición y hora). Al MINSA se sigue enviando 24 h (`08:00|08:15`), y el bot entiende horas escritas en 12 h o 24 h.
- **Departamentos permitidos:** los define `CITA_ALLOWED_DEPARTAMENTOS` (por ejemplo `LIMA`). Vacía o sin definir = sin filtro. El filtro aplica a la búsqueda por nombre, a las pistas del primer mensaje y al modo manual (departamento → provincia → distrito).
- **Fechas del MINSA:** "hoy" y "fin de mes" se calculan con el reloj de Lima, no con el del servidor.

## Observaciones del código (pendientes de decidir)
- **"No hay fechas disponibles para ese establecimiento." cierra el flujo** sin ofrecer otra fecha ni otro distrito.
