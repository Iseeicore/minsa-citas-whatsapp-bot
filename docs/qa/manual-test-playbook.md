# Playbook de pruebas manuales — rama `feat/lexical-guard`

Guía para imprimir o seguir paso a paso, desde **WhatsApp real** o desde el **Sandbox**. Cada caso indica qué escribir o tocar, qué debe responder el bot, qué debe pasar por dentro y cuándo se considera aprobado.

Los textos de respuesta de este documento están copiados del código y de una ejecución real de cada escenario. Si un texto no coincide letra por letra, anótalo como **Rechazado**.

Marca cada caso: ☐ Aprobado  ☐ Rechazado. Anota la hora y, si falla, la captura y la línea de log correspondiente (ver la sección 5).

---

## 0. Antes de empezar

### 0.1 Dónde probar

| Entorno | Cómo entrar | Para qué sirve |
|---|---|---|
| **Sandbox (widget)** | `/sandbox` | Simula al ciudadano. No muestra el panel de depuración. |
| **Sandbox (consola)** | `/configuracion-visor-sandbox` y el interruptor **Sandbox** | Igual, pero con el panel **Debug** a la derecha (visible en pantallas anchas) que muestra `from`, `state` y `slots`, y con el botón **Reiniciar todas las pruebas**. **Úsalo para verificar los slots.** |
| **WhatsApp real** | Tu número de prueba escribiendo al número del bot | Prueba el webhook completo: firma, base de datos, ritmo de mensajes y multimedia. |
| **Chat real** | `/configuracion-visor-sandbox` con el interruptor **Chat real** | Muestra las conversaciones guardadas. Sirve para comprobar que un mensaje rechazado NO creó una conversación. |

### 0.2 Datos del modo fake (Sandbox por defecto)

| Dato | Valor |
|---|---|
| DNI válido | `12345678` |
| Código OTP | `1234` |
| Distrito que resuelve | `Lurigancho` (es el único con ubigeo de prueba) |
| Especialidades | `MEDICINA GENERAL`, `ODONTOLOGIA` |
| Establecimiento | uno solo: `CENTRO DE SALUD LURIGANCHO` (se elige solo) |
| Fechas | los tres días siguientes en hora de Lima, mostradas como `AAAAMMDD` (ej. `20260920`). La tercera tiene un único horario (caso 3.17) |
| Horarios | `08:00 - 08:30`, `09:30 - 10:00`, `13:00 - 13:30` |

En **modo real** (variables `SANDBOX_USE_REAL_*` encendidas) los datos vienen de MINSA/RENIEC/Gemini y cambian cada día. Los casos marcados con ⚙ dependen de que el día tenga ese horario; si no lo tiene, anótalo como **No aplicable**, no como fallo.

### 0.3 Cómo saber si se usó IA

Sin mirar ningún panel de consumo:

| Si en pantalla aparece… | Significa |
|---|---|
| `Un momento, estamos revisando tu mensaje…` | Se consultó a la IA para entender la intención (en modo real: **1 llamada a Gemini**). |
| `Buscando tu distrito: "…"…` | Se consultó a la IA para el distrito. |
| Ninguno de los dos | Se resolvió **sin IA**. |

### 0.4 Qué es un «primer mensaje»

Un primer mensaje es el que llega **sin sesión abierta**.
- **Sandbox:** abre una ventana de incógnito o pulsa **Reiniciar todas las pruebas** en la consola. Esto genera una sesión nueva.
- **WhatsApp:** usa un número que nunca haya escrito antes. **El botón de reinicio no borra sesiones de WhatsApp real.** Si tu número ya tiene sesión, los filtros de primer mensaje (sección 1) no se aplican: pide que borren tu fila de sesión o usa otro número.

### 0.5 Diferencias entre canales

| Comportamiento | Sandbox | WhatsApp real |
|---|---|---|
| Primer mensaje normal | Un saludo: la bienvenida, en **un solo mensaje** con el botón **Continuar mi cita**. Un pedido de cita o de reclamo: directo a ese flujo. Otro texto: el menú. Sin IA. | Igual (mismas reglas en los dos canales). |
| Límite de ritmo (5 en 10 s / 20 en 60 s) | No aplica. | Sí aplica. |
| Notas de voz y stickers | No se pueden enviar (solo imagen con 📎). | Sí. |
| Registro en «Chat real» | No guarda conversaciones. | Guarda mensajes y respuestas. |

---

## 1. Perímetro y seguridad temprana (costo 0 de IA, sin tocar base de datos)

**Qué garantiza esta sección:** un primer mensaje malo se corta antes de escribir en Postgres, antes de pedir el candado y antes de llamar a la IA. Solo el texto fijo sale al ciudadano.

### 1.1 Payload excesivo (más de 300 caracteres) — primer mensaje

Texto de prueba de 383 caracteres (cópialo completo):

```
Hola buenas tardes, quiero agendar una cita médica de odontología en el distrito de San Borja para mañana por la tarde porque tengo un dolor de muela muy fuerte desde hace tres días y no puedo dormir ni comer bien, ya intenté con pastillas pero no se me quita, además necesito que sea en un centro de salud cercano a mi casa, por favor ayúdenme lo más rápido posible, muchas gracias.
```

Para generar exactamente 300 y 301 caracteres en PowerShell: `('a' * 300) | clip` y `('a' * 301) | clip`.

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 1.1a | Enviar el texto de 383 caracteres como **primer mensaje**. | Un solo mensaje de texto: `Mensaje no reconocido. El asistente del MINSA solo atiende solicitudes de citas médicas y registro de reclamos. Por favor elija una opción: [1] Citas [2] Reclamos.` Sin bienvenida, sin botones, sin menú. | Sin IA. Sin escribir en la base: no crea conversación ni sesión. Sin candado. Log: `perimeter.rejected` con `reason: too_long` (solo WhatsApp). | ☐ ☐ |
| 1.1b | Enviar `('a' * 301)` como primer mensaje. | El mismo texto de rechazo. | Igual que 1.1a. | ☐ ☐ |
| 1.1c | Enviar `hola ` repetido 60 veces (300 caracteres, sin una letra repetida). | **No** se rechaza. Como no es un saludo ni un pedido, sale el menú `¿En qué podemos ayudarte hoy?` (WhatsApp y Sandbox), sin bienvenida. | El límite es «más de 300». | ☐ ☐ |
| 1.1d | Tras 1.1a, enviar `Hola`. | Se comporta como primer contacto normal (bienvenida). | El rechazo no dejó sesión. | ☐ ☐ |
| 1.1e | **WhatsApp:** abrir **Chat real** tras 1.1a. | Tu número **no** aparece como conversación nueva. | Confirma que no se escribió nada. | ☐ ☐ |
| 1.1f | Con sesión abierta (ya en el flujo de reclamo, en el paso de la descripción), enviar el texto de 383 caracteres. | **No** se rechaza: el bot lo acepta como descripción del reclamo (permite hasta 1000). | El filtro solo aplica al primer mensaje. | ☐ ☐ |
| 1.1g | Tras 1.1a, escribir `1` (y en otra prueba `2`). | `1`: `¡Hola! Vamos a agendar tu cita. Para comenzar, por favor indícanos tu número de DNI (8 dígitos):`. `2`: `¡Hola! Vamos a registrar tu reclamo en el Libro de Reclamaciones. ¿Tienes tu DNI a la mano?` con los botones **[Sí, tengo DNI]** y **[No tengo DNI]**. | El texto de rechazo ofrece «[1] Citas [2] Reclamos»: la respuesta numérica funciona sin menú previo. Sin IA. | ☐ ☐ |

### 1.2 Enlaces, publicidad y enlaces de WhatsApp — primer mensaje

Respuesta esperada en todos los casos de rechazo: el mismo texto de 1.1a. Log: `... rejected a first message from ...NNNN: link`.

| # | Acción del usuario (texto exacto) | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 1.2a | `wa.me/51999999999` | Texto de rechazo. | Corte inmediato, sin IA y sin base de datos. | ☐ ☐ |
| 1.2b | `http://ofertas-gratis.example.org` | Texto de rechazo. | Igual. | ☐ ☐ |
| 1.2c | `https://bit.ly/3abc` | Texto de rechazo. | Igual. | ☐ ☐ |
| 1.2d | `www.ofertas.net` | Texto de rechazo. | Igual. | ☐ ☐ |
| 1.2e | `visita ofertas.com hoy` | Texto de rechazo. | Igual. | ☐ ☐ |
| 1.2f | `entra a mipagina.pe` | Texto de rechazo. | Igual. | ☐ ☐ |
| 1.2g | `HTTP://MAYUSCULAS.COM` | Texto de rechazo. | No distingue mayúsculas. | ☐ ☐ |
| 1.2h | `vivo en Lima.Peru` (no es un enlace) | **No** se rechaza. Sigue el flujo normal. | Falso positivo: si se rechaza, es un fallo. | ☐ ☐ |
| 1.2i | `son las 8.45 am` (no es un enlace) | **No** se rechaza. | Igual. | ☐ ☐ |
| 1.2j | Con sesión abierta, dentro del reclamo: `mi dirección está en https://maps.example.org/x` | **No** se rechaza; se guarda como parte del reclamo. | Solo aplica al primer mensaje. | ☐ ☐ |

### 1.3 Spam, emojis repetidos y letras infinitas

> **Límite conocido:** el perímetro **no** filtra spam corto (menos de 300 caracteres y sin enlaces). Solo corta lo largo y lo que trae enlaces. Los casos 1.3b y 1.3d verifican que el bot **no se rompe**, no que lo bloquee.

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 1.3a | Primer mensaje: `GANA DINERO FACIL ` repetido 18 veces (324 caracteres). | Texto de rechazo de 1.1a. | Igual que 1.1a. | ☐ ☐ |
| 1.3b | Primer mensaje: `🔥🔥🔥💰💰💰` | Se rechaza con el texto de 1.1a (`Mensaje no reconocido…`). Sin bienvenida, sin menú. | Regla de repetición (seis emojis sin palabras). Sin IA, sin sesión. Log: `perimeter.rejected` con `reason: repeat`. | ☐ ☐ |
| 1.3c | Primer mensaje: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` (48 letras). | Se rechaza con el texto de 1.1a. | Regla de repetición (10 o más iguales seguidas). Log: `reason: repeat`. | ☐ ☐ |
| 1.3d | Con sesión abierta y en el menú: `🔥🔥🔥💰💰💰` | Aparece `Un momento, estamos revisando tu mensaje…` y luego el menú. | En modo real es **1 llamada a Gemini** (sale unclear y cae al menú). Sin errores. | ☐ ☐ |
| 1.3e | Primer mensaje: `👍` (y en otra prueba `jajajajaja` o `holaaaa`). | **No** se rechaza: sale el menú `¿En qué podemos ayudarte hoy?` (o la bienvenida con `holaaaa`). | Un solo emoji, la risa y un saludo alargado no son spam: el límite es 10 iguales seguidas o 6 emojis sin palabras. | ☐ ☐ |

### 1.4 Multimedia sin sesión — solo WhatsApp (excepto imagen)

Requiere un número **sin sesión** (ver 0.4).

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 1.4a | **WhatsApp:** enviar una **foto** como primer mensaje. | Solo texto: `Hola. Para iniciar su atención con el asistente del MINSA, por favor escriba un mensaje de texto con la palabra HOLA o seleccione una opción del menú.` | **No** descarga la foto (sin llamadas a Graph para media). Sin IA, sin base de datos, sin candado. Log: `... rejected a first message from ...NNNN: media`. | ☐ ☐ |
| 1.4b | **WhatsApp:** enviar un **sticker** como primer mensaje. | El mismo texto. | Igual. | ☐ ☐ |
| 1.4c | **WhatsApp:** enviar una **nota de voz** como primer mensaje. | El mismo texto. | Igual. | ☐ ☐ |
| 1.4d | **WhatsApp:** enviar un **video** o un **documento** como primer mensaje. | El mismo texto. | Igual. | ☐ ☐ |
| 1.4e | **Sandbox:** tras reiniciar, pulsar 📎 y adjuntar una imagen como primer mensaje. | El mismo texto. | Igual. | ☐ ☐ |
| 1.4f | Tras 1.4a, enviar `Hola`. | Primer contacto normal (bienvenida). | El rechazo no dejó sesión. | ☐ ☐ |
| 1.4g | Con sesión, en el paso «¿Deseas adjuntar una foto como evidencia?» del reclamo, enviar una foto. | **Sí** se acepta la foto. | Con sesión, la foto sí se procesa. | ☐ ☐ |

### 1.5 Inundación (rate limiting) — solo WhatsApp

> ⚠ **Prueba con un número secundario.** La sanción por exceso se mantiene **1 hora** y ese número no podrá conversar. Se guarda en memoria de la instancia: se libera a la hora o al reiniciar/desplegar.

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 1.5a | Enviar `hola` **6 veces en menos de 10 segundos** (copia el texto y pulsa enviar rápido). | Se atienden los primeros 5. Al sexto llega **un solo aviso**: `Está enviando mensajes muy rápido. Por favor, espere 2 minutos y vuelva a escribirnos.` Del séptimo en adelante: ningún mensaje (silencio). | El sexto silencia el número **2 minutos** y es el único que recibe respuesta; el resto se descarta sin base de datos ni IA. Meta recibe igualmente su 200 (no reintenta). Logs: `perimeter.muted` (una vez) y `perimeter.dropped` con `reason: throttled` por cada mensaje descartado (`noticeSent: true` en el sexto). | ☐ ☐ |
| 1.5b | Esperar 10 segundos y enviar `hola`. | **Sigue sin responder** y **sin repetir el aviso**: el número está silenciado 2 minutos. | El silencio dura más que la ventana de 10 s. El aviso de 1.5a solo sale una vez por silencio. | ☐ ☐ |
| 1.5c | Enviar mensajes sostenidos hasta pasar de 20 en un minuto (uno cada 2–3 s durante un minuto). | El bot deja de responder. Sigue en silencio aunque escribas tras unos minutos. | Sanción de 1 hora. Log: `perimeter.banned` (1 hora, más de 20 mensajes en 60 s). | ☐ ☐ |
| 1.5d | Escribir con **otro** número mientras el primero está sancionado. | El segundo número responde normalmente. | La sanción es por número, no global. | ☐ ☐ |
| 1.5e | Esperar **2 minutos** desde la ráfaga de 1.5a y enviar `hola`. | Vuelve a responder con normalidad. | El silencio terminó. Si en esos 2 minutos se insistió hasta pasar de 20 mensajes en 60 s, en cambio, aplica la sanción de 1 hora (1.5c). | ☐ ☐ |

### 1.6 Firma del webhook (Paso 0) — solo con herramientas

| # | Acción | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 1.6a | Enviar un `POST` a `/webhook/whatsapp` **sin** la cabecera `x-hub-signature-256` (por ejemplo con `curl -X POST -d '{}' <url>`). | HTTP **403** `Forbidden`. Ningún mensaje al ciudadano. | No se crea conversación, mensaje ni sesión; no hay línea `turn.start` en los logs. | ☐ ☐ |
| 1.6b | Repetir con una firma inventada (`sha256=` y 64 ceros). | HTTP **403**. | Igual que 1.6a. La comparación de la firma es en tiempo constante. | ☐ ☐ |

---

## 2. Filtro léxico (los 3 caminos)

Si no se indica lo contrario, envía cada texto **en el menú** (con sesión ya abierta). Para asegurarte, escribe primero `Hola`.

Mensaje de advertencia (`A`):
`Le recordamos que este es un canal institucional oficial del MINSA y mantenemos una política de respeto. Si desea registrar una queja o denuncia formal sobre un mal servicio de salud, escriba RECLAMO para iniciar el trámite oficial.` con el botón **[Continuar]**.

### 2.1 Agresión pura → advertencia y corte de turno

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 2.1a | `hdp` | Mensaje `A` con el botón **Continuar**. No aparece el menú. | **Sin IA** (no aparece «Un momento…»). El texto insultante no se guarda como contexto. | ☐ ☐ |
| 2.1b | `1mb3c1l` | Mensaje `A`. | Sin IA. Detecta la escritura con números. | ☐ ☐ |
| 2.1c | `1mb3c1lazo` | Mensaje `A`. | Sin IA. Detecta el sufijo -azo. | ☐ ☐ |
| 2.1d | `im.be.cil` | Mensaje `A`. | Sin IA. Detecta la palabra partida por puntos. | ☐ ☐ |
| 2.1e | `hdpp` | Mensaje `A`. | Sin IA. Detecta la consonante repetida. | ☐ ☐ |
| 2.1f | `cojuuuudo` | Mensaje `A`. | Sin IA. Colapsa letras repetidas. | ☐ ☐ |
| 2.1g | `c s m` | Mensaje `A`. | Sin IA. Une las letras sueltas. | ☐ ☐ |
| 2.1h | `hijo de puta` | Mensaje `A`. | Sin IA. | ☐ ☐ |
| 2.1i | Tras 2.1a, tocar **Continuar**. | El menú `¿En qué podemos ayudarte hoy?` con las filas **Agendar una cita médica** y **Registrar un reclamo**. | Vuelve al menú sin IA. | ☐ ☐ |
| 2.1j | Tras 2.1a, escribir `RECLAMO`. | `¿Tienes tu DNI a la mano?` con **[Sí, tengo DNI]** **[No tengo DNI]**. | La palabra que promete la advertencia funciona. Sin IA. | ☐ ☐ |
| 2.1k | **Primer mensaje** `hdp` (número o sesión nuevos). | Mensaje `A` con **Continuar**. **Sin** bienvenida. | Se crea la sesión para que el botón funcione. | ☐ ☐ |

> **No se detecta:** `idotoaia` pasa como texto normal (es demasiado distinto de «idiota»). Es un límite conocido y aceptado.

### 2.2 Iniciales legítimas → no se bloquea

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 2.2a | `Atentamente C. S. M.` (con sesión, tras `Hola`). | `Un momento, estamos revisando tu mensaje…` y luego el menú. **Sin** mensaje `A`. | Veredicto ALLOW: pasa a la intención (en modo real, 1 llamada a IA) y cae al menú. En modo real la IA decide la intención: lo esperado es el menú; lo que **no** puede pasar es el mensaje `A`. | ☐ ☐ |
| 2.2b | `Dra. Rosario P. T. M.` | Igual que 2.2a. | ALLOW. | ☐ ☐ |
| 2.2c | `Isaac S. Mendoza` | Igual que 2.2a. | ALLOW. | ☐ ☐ |
| 2.2d | `Mi posta es CS San Martín` | Igual que 2.2a. | ALLOW. | ☐ ☐ |
| 2.2e | `c.s.m` (sin espacios ni mayúsculas) | Mensaje `A` (aquí sí es evasión). | Confirma que la excepción es solo para iniciales bien escritas. | ☐ ☐ |

### 2.3 Agresión con queja → derivación al Libro de Reclamaciones

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 2.3a | `posta de mrda pésima atención del doctor` | `Lamentamos lo ocurrido. Vamos a registrar tu reclamo en el Libro de Reclamaciones. ¿Tienes tu DNI a la mano?` con **[Sí, tengo DNI]** **[No tengo DNI]**. **No** aparece el mensaje `A`. | **Sin IA.** Va directo al estado del reclamo. El usuario no queda bloqueado. | ☐ ☐ |
| 2.3b | `Doctora imbécil no me dio mi medicina` | Igual que 2.3a. | Sin IA. | ☐ ☐ |
| 2.3c | Tras 2.3a, tocar **No tengo DNI** (aparece `Cuéntanos tu reclamo (hasta 1000 caracteres).`) y escribir `El doctor fue un idiota y me trató pésimo`. | Se acepta y avanza a `¿Deseas adjuntar una foto como evidencia? Envíala ahora, o escribe OMITIR.` | En la descripción del reclamo **el insulto nunca se bloquea** (es evidencia). | ☐ ☐ |

### 2.4 Agresión con cita → advertencia y se conservan los datos

Usa el **panel Debug** de la consola para ver los `slots`.

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 2.4a | `Apúrense cojudos quiero cita de odontología en Lurigancho` | `Le recordamos que este es un canal institucional oficial del MINSA y mantenemos una política de respeto. Continuemos con tu cita: ingresa tu DNI (8 dígitos).` | **Sin IA.** Debug: `state: cita_awaiting_dni` y `slots` con `citaEspecialidadHintText: "Odontología"` y `citaDistritoHintText: "Lurigancho"`. **No** existe `initialMessageText`. | ☐ ☐ |
| 2.4b | `12345678` | `Validando tu DNI…` y `Te enviamos un código a tu teléfono registrado. Escríbelo aquí (4-8 dígitos).` | Valida el DNI. | ☐ ☐ |
| 2.4c | `1234` | Toda esta secuencia **en una sola respuesta**: `Verificando código…`, `Buscando tu ubigeo…`, `Entendido. Buscando especialidades y citas disponibles en *Lurigancho*…`, `Especialidad detectada: ODONTOLOGIA. Buscando establecimientos…`, `Establecimiento encontrado: CENTRO DE SALUD LURIGANCHO. Buscando fechas disponibles…` y la lista `Selecciona la fecha:`. | **No vuelve a preguntar el distrito ni la especialidad**: eso demuestra que se conservaron. Sin IA en toda la cadena. | ☐ ☐ |
| 2.4d | Repetir 2.4a con `en San Borja` en vez de `en Lurigancho`. | Igual en 2.4a. En modo **fake**, tras el OTP dice `No encontramos ese ubigeo. Indícanos nuevamente el departamento.` (el catálogo de prueba no conoce San Borja). En modo **real** sigue de largo. | Buscó «San Borja» sin preguntarlo: el dato se conservó. | ☐ ☐ |

---

## 3. Camino feliz de punta a punta (cita por texto y botones)

Empieza de cero (0.4). Todos los datos son del modo fake (0.2).

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 3.1a | `Hola` (sesión nueva). | **Un solo mensaje:** la bienvenida grande con el botón **[Continuar mi cita]** y, al final del texto, `¿Prefieres seguir por aquí mismo? Escríbeme lo que necesitas y te ayudo.` Incluye la línea `⚠️ En caso de emergencia médica, llama al *106* (SAMU).` **Sin** segundo mensaje y **sin** el menú `¿En qué podemos ayudarte hoy?`. | Igual en Sandbox y WhatsApp. **Sin IA:** no aparece «Un momento…». La sesión queda en `main_menu`. | ☐ ☐ |
| 3.1b | Tras 3.1a, escribir `hola` (o `1`). | Recién ahora: el menú `¿En qué podemos ayudarte hoy?` con las filas **Agendar una cita médica** y **Registrar un reclamo**. Si en cambio se escribe un pedido (`quiero una cita en Miraflores de odontología`), va directo al DNI. | El menú depende de la respuesta del ciudadano, no del primer mensaje. Sin IA para el saludo. | ☐ ☐ |
| 3.1c | Con **sesión nueva**, primer mensaje: `Sabes quiero una cita para san Juan de Lurigancho para medicina general`. | **Un solo mensaje:** `¡Hola! Te ayudaremos a agendar tu cita de Medicina General en San Juan de Lurigancho. Para comenzar, por favor indícanos tu número de DNI (8 dígitos):`. **Sin** bienvenida ni menú. | Sin IA. Slots (panel Debug): `citaDistritoHintText` = `San Juan de Lurigancho`, `citaEspecialidadHintText` = `Medicina General`. Reiniciar antes de seguir con 3.2. | ☐ ☐ |
| 3.1d | Con **sesión nueva**, primer mensaje: `Quiero poner una queja`. | **Un solo mensaje:** `¡Hola! Vamos a registrar tu reclamo en el Libro de Reclamaciones. ¿Tienes tu DNI a la mano?` con **[Sí, tengo DNI]** y **[No tengo DNI]**. Sin bienvenida ni menú. | Sin IA. Estado `reclamo_identity_choice`. Reiniciar antes de seguir. | ☐ ☐ |
| 3.1e | Con **sesión nueva**, primer mensaje: `necesito hablar con alguien`. | El menú `¿En qué podemos ayudarte hoy?` con **Agendar una cita médica** y **Registrar un reclamo**. **Sin** bienvenida. | Sin IA. El texto queda como primer mensaje para usarlo de contexto en el distrito. Reiniciar antes de seguir. | ☐ ☐ |
| 3.2 | `1` | `Ingresa tu DNI (8 dígitos).` **Sin** volver a mostrar el menú. | Atajo numérico: `2` haría lo mismo con el reclamo. Sin IA. | ☐ ☐ |
| 3.3 | `1234567` (7 dígitos) | `DNI inválido. Debe tener 8 dígitos. Intenta de nuevo.` | Validación de formato, sin IA. | ☐ ☐ |
| 3.4 | `12345678` | `Validando tu DNI…` y `Te enviamos un código a tu teléfono registrado. Escríbelo aquí (4-8 dígitos).` | Llamada a MINSA (fake). | ☐ ☐ |
| 3.5 | `0000` | `Código incorrecto. Te quedan 2 intento(s).` | Cuenta el intento. | ☐ ☐ |
| 3.6 | `1234` | `Verificando código…` y `¡Verificado! Cuéntanos en qué distrito buscas atención (ej. "Miraflores").` | Guarda el token. | ☐ ☐ |
| 3.7 | `asdfghjk` | `No reconocimos ese distrito. Por favor escribe el nombre de tu distrito o comuna:` | **Sin IA:** el filtro de basura lo corta antes de Gemini. Sigue en el mismo paso. | ☐ ☐ |
| 3.8 | `qwertyuiop` | El mismo mensaje. | Igual. | ☐ ☐ |
| 3.9 | `Lurigancjo` (error leve) | **Modo real:** `Buscando tu distrito: "Lurigancjo"…` y continúa (la IA lo corrige). **Modo fake:** `Buscando tu distrito: "Lurigancjo"…` y el botón **Cita Nivel Global** (el fake no corrige errores). | En modo real: **1 llamada a IA**. Aquí sí se llama a la IA (no es basura). | ☐ ☐ |
| 3.10 | Reiniciar y llegar al paso 3.6 de nuevo. Escribir `Lurigancho`. | `Buscando tu ubigeo…`, `Entendido. Buscando especialidades y citas disponibles en *Lurigancho*…` y la lista `Selecciona la especialidad:` (MEDICINA GENERAL, ODONTOLOGIA). | Resuelto **sin IA** con el padrón local. | ☐ ☐ |
| 3.11 | `odontología` (texto, sin tocar la lista) | `Buscando establecimientos…`, `Establecimiento encontrado: CENTRO DE SALUD LURIGANCHO. Buscando fechas disponibles…` y la lista `Selecciona la fecha:` con filas como `mar 22 sep` (no la fecha cruda que entrega MINSA o el catálogo fake). | Coincide el nombre con la fila ofrecida. Sin IA. La fila muestra día de semana + fecha con el mes en letras; lo que viaja a MINSA (`citaFecha`) no cambia. | ☐ ☐ |
| 3.12 | `1` | `Buscando horarios disponibles…` y la lista `Selecciona el horario:` (8:00 AM - 8:30 AM, 9:30 AM - 10:00 AM, 1:00 PM - 1:30 PM). | En listas, `1` es la posición 1. Las horas se muestran en formato 12 horas; hacia MINSA siguen viajando en 24 horas (`08:00`, `13:00`…), sin cambio. | ☐ ☐ |

> **Un solo horario (G1, cerrado):** si un día ofrece **un solo** horario, o la última página de «Ver más horarios» deja uno solo, el bot **pide confirmación** antes de agendar (caso 3.17). Con el catálogo fake, la **tercera fecha** de la lista tiene un único horario para probarlo.

### 3.13 Selección de horario (parte de la lista `08:00 / 09:30 / 13:00`)

Vuelve a la lista de horarios (3.12) antes de cada caso. Tras cada confirmación intermedia, toca **No, ver horarios**.

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 3.13a | `8` (⚙) | `¿Confirmas el horario 8:00 AM - 8:30 AM?` con **[Sí, confirmar]** **[No, ver horarios]**. | No existe la opción 8, pero sí un horario 08:00: resuelve a la hora y **pide confirmación**. No agenda solo. | ☐ ☐ |
| 3.13b | `3` (⚙) | `¿Confirmas el horario 1:00 PM - 1:30 PM?` | La posición 3 es 13:00 y no hay 3 AM ni 3 PM: resuelve directo, con confirmación. | ☐ ☐ |
| 3.13c | `1` (⚙) | `¿A qué te refieres con "1"? Opción 1: 08:00, o 1:00 PM (13:00).` con dos botones **[Opción 1: 08:00]** y **[1:00 PM: 13:00]**. | Hay dos lecturas distintas: pregunta. **No agenda.** | ☐ ☐ |
| 3.13d | Tras 3.13c, tocar **1:00 PM: 13:00**. | `Agendando tu cita…`, la constancia y el cierre (ver 3.14). | El botón nombra la hora exacta: agenda directo. | ☐ ☐ |
| 3.13e | Repetir 3.13c y tocar **Opción 1: 08:00**. | Agenda la cita de las 08:00. | Igual. | ☐ ☐ |
| 3.13f | Repetir 3.13c y, en vez de tocar un botón, escribir `1 pm`. | `¿Confirmas el horario 1:00 PM - 1:30 PM?` | Escribir una hora vale como una respuesta normal. | ☐ ☐ |
| 3.13g | `en la tarde` | `¿Confirmas el horario 1:00 PM - 1:30 PM?` | Filtra solo los horarios de 12:00 en adelante (solo hay uno). | ☐ ☐ |
| 3.13h | `a las 9 y media` | `¿Confirmas el horario 9:30 AM - 10:00 AM?` | Entiende 12h y lo cruza con lo ofrecido. La confirmación se muestra en 12h; lo que se envía a MINSA es siempre `09:30` (24h de la fila). | ☐ ☐ |
| 3.13i | `a la 1` | `¿Confirmas el horario 1:00 PM - 1:30 PM?` | «a la 1» tiene marcador de hora: no es la posición 1. | ☐ ☐ |
| 3.13j | `5` | `Selecciona una opción de la lista.` y la lista de nuevo. | No es posición ni hora ofrecida: se rechaza y **no** viaja a MINSA. | ☐ ☐ |
| 3.13k | `a las 3` | `No hay horarios disponibles a esa hora. Elige uno de la lista:` y la lista. | Entendida pero no ofrecida. | ☐ ☐ |
| 3.13l | `hdp` | `Le recordamos que este es un canal institucional oficial del MINSA y mantenemos una política de respeto.` y la lista de nuevo. | El filtro también protege los pasos de selección. | ☐ ☐ |

### 3.14 Confirmación y cierre

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 3.14a | Tocar **Sí, confirmar** (o escribir `sí`). | Cuatro mensajes: `Agendando tu cita…`; la constancia que empieza con `*MINISTERIO DE SALUD DEL PERÚ*`; el enlace **[Ver mi cita]**; y `Gracias por comunicarte con el *Ministerio de Salud del Perú*. Si necesitas agendar otra cita o realizar una consulta, escríbenos nuevamente cuando lo necesites. ¡Que tengas un buen día! 👋`. | Estado final `cita_booked`. Se agendó una sola vez. | ☐ ☐ |
| 3.14b | Tocar **No, ver horarios**. | `Sin problema. Elige otro horario:` y la lista. | No se agenda. | ☐ ☐ |
| 3.14c | Tras 3.14a, escribir `Hola`. | La bienvenida (un solo mensaje), **sin** el menú encima. | Reinicio tras un estado terminal: mismo tratamiento que un primer mensaje (3.1a). Con un pedido claro (`quiero una cita en Miraflores`) entra directo a la cita, como 3.1c. | ☐ ☐ |

### 3.15 Comportamientos añadidos tras la prueba de campo

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 3.15a | Con el OTP ya verificado (por ejemplo tras 3.6), esperar **más de 10 minutos** y escribir cualquier cosa (`Miraflores`). | `⏳ Tu sesión ha expirado por inactividad. Por tu seguridad, necesitamos confirmar nuevamente tu identidad para continuar con tu cita. ¿Deseas solicitar un nuevo código de verificación?` con `[1] Sí, enviar código` y `[2] Cancelar y volver al menú`, y los botones **[Sí, enviar código]** y **[Cancelar]**. | Estado `cita_awaiting_reauth`. Se borran el token de MINSA y los datos del horario; el DNI y lo ya elegido (distrito, especialidad…) se conservan. Solo aplica cuando el bot espera al ciudadano con sesión verificada. | ☐ ☐ |
| 3.15b | Tras 3.15a, escribir `si por favor` (o `1`, o tocar **Sí, enviar código**). | `Enviándote un nuevo código de verificación…` y `Te enviamos un código a tu teléfono registrado. Escríbelo aquí (4-8 dígitos).` Tras el código (`1234` en fake) continúa en el paso donde estaba. | Reusa el DNI guardado, no lo pide de nuevo. Sin IA. | ☐ ☐ |
| 3.15c | Repetir 3.15a y responder `no, gracias` (o `2`, o **Cancelar**). | El menú `¿En qué podemos ayudarte hoy?`. | La sesión queda vacía, sin token ni DNI. | ☐ ☐ |
| 3.15d | En `¿Confirmas el horario …?` escribir `Si por favor` (también `dale`, `ok`, `de acuerdo`). | `Agendando tu cita…` y sigue como con el botón. Con `no, gracias`, `otro horario` o `ver mas` vuelve `Sin problema. Elige otro horario:`. | Reconocedor de sí/no sin IA. Con algo ambiguo (`si pero a las 3`) repite los botones sin agendar. | ☐ ☐ |
| 3.15e | Con la sesión ya iniciada (tras la bienvenida), escribir `Quiero una cita en San Juan de Lurigancho para poder atenderme en medicina general`. | `¡Entendido! Quieres agendar una cita médica. Antes de continuar necesito verificar tu identidad — ingresa tu DNI (8 dígitos).` **Sin** `Un momento, estamos revisando tu mensaje…`. | **Sin IA.** Mismos slots que 3.1c. | ☐ ☐ |
| 3.15f | Escribir `hdp` en el menú y, tras la advertencia, `ya dale` (también `continuar`, `vamos`, `sigue`). | El menú `¿En qué podemos ayudarte hoy?`, sin `Un momento…`. | Equivale a tocar **Continuar**. Solo vale justo después de la advertencia. | ☐ ☐ |
| 3.15g | Solo con MINSA real: provocar que la reserva falle (por ejemplo un cupo tomado). | `No pudimos reservar ese horario, puede que otra persona lo haya tomado justo antes. Te muestro los horarios disponibles de la misma fecha:` y la lista de nuevo. A la tercera falla: `No pudimos agendar tu cita. Intenta de nuevo más tarde.` | Log `minsa.book_appointment.failed` con el endpoint, el estado, el mensaje de MINSA y el payload sin DNI (ver 4.4). | ☐ ☐ |
| 3.15h | Con el OTP verificado, escribir un distrito que MINSA devuelva junto a vecinos (solo con MINSA real, por ejemplo `San Juan de Lurigancho`). | `Entendido. Buscando especialidades y citas disponibles en *San Juan de Lurigancho*…` y luego la lista de especialidades. **Sin** `Selecciona tu ubigeo:`. | Si entre los resultados hay uno que es exactamente el distrito ya resuelto, se elige solo. Si la lista sí aparece y se responde con texto (`San Juan de Lurigancho`), el mismo mensaje `Entendido…` nombra el distrito. | ☐ ☐ |
| 3.15i | Solo con MINSA real: elegir un distrito sin especialidades disponibles. | `No encontramos especialidades disponibles en *{distrito}* en este momento.` `¿Deseas buscar en otro distrito cercano?` con `[1] Sí, buscar otro distrito` `[2] No, salir` y los botones **[Sí, otro distrito]** y **[No, salir]**. | Estado `cita_awaiting_other_distrito`: la conversación **no** se cierra. Un texto suelto (`quee ?`) repite la pregunta, sin bienvenida. | ☐ ☐ |
| 3.15j | Tras 3.15i, responder `sí` (o `dale`, `cambiar`, `1`, o tocar **Sí, otro distrito**). | `Perfecto. Cuéntanos en qué otro distrito buscas atención (ej. "Miraflores").` | Se olvida el distrito anterior (y el primer mensaje, para que no lo vuelva a usar); se conservan el DNI y la verificación. | ☐ ☐ |
| 3.15k | Tras 3.15i, responder `no` (o `salir`, `cancelar`, `2`, o tocar **No, salir**). | `Gracias por comunicarte con el *Ministerio de Salud del Perú*. Cuando quieras volver a intentarlo, escríbenos nuevamente. ¡Que tengas un buen día! 👋` | Sesión limpia (estado `cita_no_coverage_closed`). Escribir `Hola` después da la bienvenida. | ☐ ☐ |

### 3.16 Consultas fuera de alcance (sin IA)

Texto de cada respuesta: el del Excel de auditoría (hoja «Catálogo de Intenciones OutofSc»). Se pueden probar en el menú (Sandbox o WhatsApp) y también como **primer mensaje** de una sesión nueva: la respuesta es la misma y sin bienvenida. **Sin IA**: no aparece «Un momento…».

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 3.16a | `Mi mamá no puede respirar` (también `dolor de pecho`, `creo que es un infarto`, `se está asfixiando`, `me muero`) | Un solo mensaje: `⚠️ ESTE CANAL NO ATIENDE EMERGENCIAS MÉDICAS` … `- SAMU: 106 (ambulancias y emergencias médicas)` `- Bomberos: 116 (rescate y urgencias)` … `Acuda ahora mismo al establecimiento de salud más cercano.` **Sin** invitar a continuar. | La conversación **termina**: estado `emergency_closed`, sesión vacía, sin token, nada pendiente. Log `turn.note` (**warn**) `out_of_scope` con `category: OOS-01`, `closed: true`. El siguiente mensaje empieza una conversación nueva (`Hola` da la bienvenida). | ☐ ☐ |
| 3.16b | `ustedes son unos idiotas, mi mamá no puede respirar`; y `quiero una cita, me duele el pecho` | El mismo mensaje de emergencia, **no** la advertencia institucional ni el inicio de la cita. | La emergencia se lee antes que el filtro léxico y antes que cualquier intención de cita o reclamo. | ☐ ☐ |
| 3.16c | `¿Mi SIS está activo?` | `Consulta sobre SIS (Seguro Integral de Salud):` … `app.sis.gob.pe/ConsultaWeb` … `941 988 565` … `escriba CITAS.` | `category: OOS-02` (nivel info). | ☐ ☐ |
| 3.16d | `¿Ya aceptaron mi referencia?` | `Gestión de Referencias Médicas:` … `REFCON` … `Admisión/Referencias`. | `OOS-03`. `punto de referencia` (una dirección) **no** dispara esto. | ☐ ☐ |
| 3.16e | `¿Ya salieron mis análisis de sangre?` | `Entrega de Resultados Médicos:` … `Ley N° 26842` … `de forma presencial`. | `OOS-04`. | ☐ ☐ |
| 3.16f | `¿Tienen Paracetamol o Insulina en la posta?` | `Consulta de Medicamentos:` … `observatorio.digemid.minsa.gob.pe` … `escriba RECLAMO`. | `OOS-05`. `medicina general` (una especialidad) **no** dispara esto. | ☐ ☐ |
| 3.16g | `¿Qué días vacunan contra la influenza?` | `Vacunación y Carnets Oficiales:` … `carnetvacunacion.minsa.gob.pe` … `Línea 113 (Opción 1)`. | `OOS-06`. | ☐ ☐ |
| 3.16h | `Quiero hablar con un doctor ahorita` | `Orientación Médica Telefónica Gratuita:` … `Infosalud: Línea 113`. | `OOS-07`. | ☐ ☐ |
| 3.16i | `Mi reclamo N° 458-2026 sigue sin resolverse` | `Seguimiento de Reclamos:` … `SUSALUD al 113 (Opción 7)` … `escriba RECLAMO`. | `OOS-08`. Pedir el **estado** de un reclamo ya presentado no abre un reclamo nuevo. | ☐ ☐ |
| 3.16j | `Necesito que me sellen mi descanso médico para mi trabajo` | `Trámites Documentarios y Certificados:` … `SISFOH` … `Unidad Local de Empadronamiento (ULE)`. | `OOS-09`. | ☐ ☐ |
| 3.16k | Tras cualquiera de las anteriores, escribir `CITAS`; en otra prueba `CONTINUAR`; en otra `RECLAMO`. | `CITAS`: `Ingresa tu DNI (8 dígitos).` `CONTINUAR`: el menú `¿En qué podemos ayudarte hoy?`. `RECLAMO`: `¿Tienes tu DNI a la mano?` con los dos botones. | Las tres palabras que piden los mensajes se entienden **sin IA**. Solo la palabra sola: `quiero una cita` sigue su camino de antes. | ☐ ☐ |
| 3.16l | Con la sesión ya iniciada, en el paso del DNI escribir `vacunas`; en el paso de la descripción del reclamo escribir `no me entregaron mis medicamentos`. | DNI: `DNI inválido. Debe tener 8 dígitos. Intenta de nuevo.` Reclamo: se toma como la descripción y sigue el flujo. | Dentro de un flujo solo se aplica la lectura de urgencias (3.16o): las demás categorías nunca, cada paso lee lo que pidió. | ☐ ☐ |
| 3.16m | `quiero una cita de medicina general` y `necesito cita en medicina interna` | Siguen el camino de la cita (DNI o consulta a la IA), **sin** mensaje de medicamentos. | Contraejemplos de falsos positivos de OOS-05. | ☐ ☐ |
| 3.16n | Tras terminar un flujo (por ejemplo tras 3.14a), escribir `¿Tienen vacunas para mi bebé?` | El mensaje de OOS-06, **sin** bienvenida. | El reingreso tras un estado terminal se lee igual que un primer mensaje. | ☐ ☐ |
| 3.16o | En el paso del DNI (o del OTP, del distrito, de la descripción del reclamo, de la confirmación del horario) escribir `mi hijo no respira`. | El mismo mensaje de emergencia de 3.16a, **y nada más**: el flujo **se cierra**. | Sesión `emergency_closed` vacía: se pierde la verificación y lo elegido, a propósito (el bot no mantiene abierta una conversación con una urgencia). Solo textos de hasta 120 caracteres. Con la sesión expirada o esperando la nueva verificación también se corta. | ☐ ☐ |
| 3.16p | En el paso de la descripción del reclamo pegar un relato largo (más de 120 caracteres) que mencione `una ambulancia que nunca llegó`. | Se toma como la descripción y sigue `¿Deseas adjuntar una foto como evidencia?…`, **sin** el mensaje de emergencia. | Un relato de un hecho pasado es evidencia, no una alarma. | ☐ ☐ |

### 3.17 Un solo horario disponible (confirmación antes de agendar)

Sandbox con el catálogo fake: en la lista de fechas elige la **tercera** fila (`mié 24 sep` o el día que corresponda; tiene un único horario, 1:00 PM - 1:30 PM). Con MINSA real sirve cualquier día con un solo horario, o una última página con uno solo.

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 3.17a | Elegir la tercera fecha. | `Solo hay un horario disponible: 1:00 PM - 1:30 PM. ¿Lo confirmas?` con **[Sí, confirmar]** y **[No, gracias]**. **No** aparece `Agendando tu cita…`. | Estado `cita_awaiting_hora_confirm`. No se consulta `book_appointment` hasta que el ciudadano confirma. | ☐ ☐ |
| 3.17b | Tocar **Sí, confirmar**. | `Agendando tu cita…`, la constancia y el cierre (ver 3.14a). | Se agenda una sola vez. | ☐ ☐ |
| 3.17c | Repetir 3.17a y escribir `esa hora` (también `me sirve`, `me conviene`, `esa misma`, `la tomo`, `13:00`, `a la 1`, `sí`). | Igual que 3.17b: agenda. | Se entiende que toma **ese** horario, escrito o con palabras. Sin IA. | ☐ ☐ |
| 3.17d | Repetir 3.17a y escribir `a las 3`, `13:30`, `si pero a las 3` o `no a la 1`. | Repite `Solo hay un horario disponible: 1:00 PM - 1:30 PM. ¿Lo confirmas?` con los botones. **No agenda.** | Una hora distinta, o cualquier negación, nunca agenda. Log `turn.note` (warn) `confirmation_unknown`. | ☐ ☐ |
| 3.17e | Repetir 3.17a y tocar **No, gracias** (o escribir `no`, `otro horario`). | `Entendido, ese horario no te conviene. Como era el único horario disponible para esa fecha, te recomiendo elegir otra fecha.` `¿Deseas cambiar de fecha?` con `[1] Sí, cambiar de fecha` `[2] No, salir` y los botones **[Sí, otra fecha]** y **[No, salir]**. | Estado `cita_awaiting_other_fecha`. La sesión **no** se cierra: se conservan el token, el DNI, el establecimiento y la especialidad. La fecha rechazada se recuerda como descartada. Log `turn.note` `hora_declined`. | ☐ ☐ |
| 3.17f | Tras 3.17e, tocar **Sí, otra fecha** (o `sí`, `1`, `otra fecha`, `cambiar`, `otro día`). | `Buscando otras fechas disponibles…` y la lista de fechas **sin la fecha descartada** (con el catálogo fake quedan las dos primeras). Sin pedir DNI ni OTP otra vez. | Vuelve a consultar las fechas. Si queda una sola, se toma sola y sigue a sus horarios. | ☐ ☐ |
| 3.17g | Tras 3.17e, tocar **No, salir** (o `no`, `2`, `salir`). | `Lamentamos no haber encontrado un horario que se ajuste a lo que necesitas. Gracias por comunicarte con el *Ministerio de Salud del Perú*. Cuando quieras volver a intentarlo, escríbenos nuevamente. ¡Que tengas un buen día! 👋` **Sin** pedir que escriba CITAS. | Estado `cita_declined_closed`, sesión vacía sin token. Escribir `Hola` después da la bienvenida. Log `cita_closed` con `reason: declined`. | ☐ ☐ |
| 3.17h | Con MINSA real y un establecimiento con **una sola** fecha: repetir 3.17a y 3.17f. | `Lamentamos informarte que por ahora no hay otras fechas disponibles en este establecimiento.` y la despedida. | Como la fecha rechazada no se vuelve a ofrecer, no hay bucle. Log `cita_closed` con `reason: no_other_dates`. | ☐ ☐ |
| 3.17i | En 3.17f elegir otra fecha que **también** tenga un solo horario y decir que no; pedir cambiar de fecha otra vez. | La lista deja fuera **las dos** fechas rechazadas; si no queda ninguna, la disculpa de 3.17h. | Las fechas descartadas se acumulan. | ☐ ☐ |
| 3.17j | Con MINSA real y un día de 11 horarios: pedir `Ver más horarios` hasta la última página (un solo horario) y tocar **No, gracias**. | `Sin problema. Elige otro horario:` y la lista de la página **anterior**. | Vuelve a la página anterior; `Ver más horarios` sigue funcionando y no queda vacío. | ☐ ☐ |
| 3.17k | En una confirmación normal (`¿Confirmas el horario 8:00 AM - 8:30 AM?`, tras escribir `8`) escribir `esa hora` o `a las 8`. | Agenda. Con `a las 9` repite la pregunta sin agendar. | Vale para cualquier confirmación de horario, no solo la del horario único. | ☐ ☐ |

---

## 4. Concurrencia manual: el candado por `waId`

**Qué hace el candado:** dos mensajes del **mismo** ciudadano nunca se procesan a la vez. El segundo espera a que termine el primero (cola en memoria y, entre instancias, un candado de Postgres). Mensajes de ciudadanos distintos no se esperan.

**Truco para comprobarlo sin depender del orden de llegada:** manda **3 códigos OTP incorrectos al mismo tiempo**. El bot permite 3 intentos y bloquea al tercero. Con el candado, las tres respuestas son distintas y completas. Sin candado se repetirían.

### 4.1 Preparar la prueba (Sandbox)

1. Abre `/sandbox` (o la consola), reinicia y escribe `1` y luego `12345678`. Debes quedar en `Te enviamos un código a tu teléfono registrado. Escríbelo aquí (4-8 dígitos).`
2. Abre las herramientas del navegador (F12) → **Console** y pega:

```js
const from = localStorage.getItem("sandbox-from");
const send = (text) =>
  fetch("/api/sandbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, type: "text", text }),
  }).then((r) => r.json());

// tres mensajes al mismo tiempo, sin esperar ninguno
const t0 = performance.now();
const results = await Promise.all([send("0000"), send("1111"), send("2222")]);
console.log(Math.round(performance.now() - t0), "ms");
console.log(results.map((r) => r.sent.map((s) => s.text ?? s.kind)));
```

3. Alternativa con `curl` (Git Bash; sustituye `TU_FROM` por el valor de `localStorage.getItem("sandbox-from")` y el dominio por el tuyo):

```bash
for code in 0000 1111 2222; do
  curl -s -X POST https://TU_DOMINIO/api/sandbox -H "Content-Type: application/json" \
    -d "{\"from\":\"TU_FROM\",\"type\":\"text\",\"text\":\"$code\"}" &
done; wait
```

### 4.2 Qué debe pasar

| # | Acción | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 4.2a | Ejecutar el bloque de la consola. | Tres respuestas. Entre las tres aparecen **exactamente**: `Código incorrecto. Te quedan 2 intento(s).`, `Código incorrecto. Te quedan 1 intento(s).` y `Superaste el número de intentos permitidos. Por favor, inicia el proceso nuevamente más tarde.` (en cualquier orden entre respuestas). | Turnos serializados: cada uno vio el resultado del anterior. El tiempo total ≈ la suma de tres turnos, no de uno. | ☐ ☐ |
| 4.2b | Revisar que **no** se repite ningún mensaje. | No hay dos veces `Te quedan 2 intento(s)`. | Si se repite, hubo *lost update* (se pisaron los turnos): es un **Rechazado grave**. | ☐ ☐ |
| 4.2c | Tras 4.2a, escribir `Hola` en el Sandbox. | La bienvenida (un solo mensaje) (estado terminal alcanzado). | El estado final es `cita_otp_locked`, consistente con 3 intentos contados. | ☐ ☐ |
| 4.2d | Repetir 4.1 dos veces más (reinicia antes de cada una). | Mismo resultado las tres veces. | No es un acierto por casualidad. | ☐ ☐ |

### 4.3 Con el celular (WhatsApp)

| # | Acción | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 4.3a | Llega al paso del DNI (`1`), y luego escribe **seguidos, sin esperar respuesta**: `12345678` y `1234`. | El bot responde **en orden**: primero el OTP pedido (`Te enviamos un código…`) y **después** `¡Verificado! Cuéntanos en qué distrito…`. Nunca al revés ni una respuesta perdida. | El segundo mensaje esperó al primero. | ☐ ☐ |
| 4.3b | Envía tres mensajes rápidos (`Hola`, `1`, `12345678`) sin esperar. | Las respuestas llegan una tras otra y coherentes: menú, `Ingresa tu DNI (8 dígitos).`, `Validando tu DNI…`. | Se procesan en el orden de llegada. | ☐ ☐ |

### 4.4 Cómo comprobarlo en los logs

Los logs son **una línea de JSON por evento** (NDJSON). Los ves en **Vercel** (proyecto → Logs; escribe `turn.end`, un `traceId` o un evento en el buscador) o, en local, en la terminal de `npm run dev`. Con `LOG_TO_FILE=true` también quedan en `logs/DD-MM-AAAA/app.ndjson` (y solo los avisos y errores en `alerts.ndjson`). Todos los eventos de un mismo mensaje comparten el `traceId`. Detalle completo en `docs/observability.md`.

| Evento | Qué significa |
|---|---|
| `turn.start` → `turn.end` | Un mensaje contestado: estado antes y después, duración en ms, llamadas externas y cambios en los datos (sin DNI completo ni token). |
| `turn.note` (`warn`) con `kind: confirmation_unknown` | Una confirmación escrita no se entendió (dice el paso: `hora_confirm`, `session_reauth`, `other_distrito`). |
| `turn.note` (`warn`) con `kind: session_expired` | La sesión caducó: `reason` es `IDLE_TIMEOUT` o `JWT_EXPIRED`, y `idleMs` cuánto llevaba inactiva (3.15a). |
| `turn.note` (`warn`) con `kind: lexical_guard` / `menu_fallback` / `no_coverage` / `booking_retry` / `out_of_scope` (la emergencia OOS-01 sale como aviso; las demás como información) | El filtro léxico actuó, la IA no entendió y volvió al menú, MINSA no tiene cobertura en el distrito, o falló una reserva y se reintentó. |
| `turn.end` (`warn`) con `friction: menu_loop` | Un texto escrito dejó al ciudadano otra vez en el menú sin ninguna respuesta determinística (1.3d). |
| `turn.external` | Una consulta a MINSA, RENIEC, Gemini o quejas, con `durationMs` y `resultStatus`. |
| `external.http` | La llamada HTTP misma: `status` real y `durationMs`. Solo la ruta, nunca la clave ni el cuerpo. |
| `minsa.book_appointment.failed` (`error`) | MINSA no agendó: `endpoint`, `status`, `minsaMessage`, `response` (300 caracteres) y el payload sin DNI. Es la evidencia del caso 3.15g. |
| `ai.fallback` (`warn`) | La IA falló y el mensaje volvió al menú; `reason` dice por qué (HTTP, tiempo agotado, respuesta vacía o JSON inválido). Nunca lleva el texto del ciudadano. |
| `perimeter.dropped` / `perimeter.muted` / `perimeter.rejected` / `perimeter.banned` | El perímetro descartó, rechazó (`too_long`, `link`, `media`) o sancionó a un número (sección 1). |
| `[turn-lock] turn waited 312 ms behind an earlier turn of ...1234` | Un turno esperó a otro del mismo ciudadano. **Es la prueba visible de que el candado serializó.** Solo aparece si la espera fue de 150 ms o más. |
| `[turn-lock] database lock for ...1234 took 340 ms` | Adquirir el candado de Postgres tardó 200 ms o más. Con base de datos lejana es normal (≈2 viajes de red). |
| `turn.lock_timeout` (`warn`) con `layer` / `webhook.message_failed` (`error`) | Un turno esperó demasiado el candado, o falló de forma inesperada (base de datos, MINSA, envío…). El ciudadano recibe `Ocurrió un inconveniente temporal al procesar tu solicitud. Por favor, intenta escribir nuevamente en unos instantes.`, como mucho una vez cada 30 s por número (una ráfaga que falla entera deja el resto de los logs sin ese texto, pero cada fallo se sigue registrando). **No deberían verse en estas pruebas**; si aparecen, anótalos. |

Si en 4.2a **no** aparece ningún `[turn-lock] turn waited`, no es un fallo por sí solo: significa que los turnos duraron menos de 150 ms. Lo que decide es 4.2a/4.2b.

### 4.5 Comprobación opcional del candado en la base real

`npm run smoke:neon` ejecuta una prueba de humo contra Neon: 4 peticiones del mismo ciudadano, 12 ciudadanos a la vez, el error real de tiempo de espera y la liberación. Solo toma candados y lee; no escribe en ninguna tabla.

---

## 5. Cuando algo falla, anota esto

1. Número de caso (por ejemplo `2.3a`) y hora.
2. Texto exacto que enviaste y respuesta exacta que recibiste (captura).
3. En la consola: el `state` y los `slots` del panel Debug.
4. Las líneas de log `perimeter.*` y `[turn-lock]` de ese minuto, y el `traceId` del turno que falló (ver 4.4).
5. El modo: fake o real, y el canal (Sandbox o WhatsApp).

## 6. Hoja de resultados

| Sección | Casos | Aprobados | Rechazados | No aplicables |
|---|---|---|---|---|
| 1. Perímetro | 1.1 – 1.6 | | | |
| 2. Filtro léxico | 2.1 – 2.4 | | | |
| 3. Camino feliz | 3.1 – 3.16 | | | |
| 4. Concurrencia | 4.2 – 4.3 | | | |

Criterio de cierre: **todos** los casos de las secciones 2, 3 y 4 aprobados, y la sección 1 aprobada salvo los límites conocidos que se anotaron como tales (1.3b, 1.3c y 1.3d).
