# Guía de pruebas manuales

Guía para imprimir o seguir paso a paso, desde **whatsapp-bot** o desde el **Chat-bot**. Cada caso indica qué escribir o tocar, qué debe responder el bot, qué debe pasar por dentro y cuándo se considera aprobado.

Los textos de respuesta de este documento están copiados del código y de una ejecución real de cada escenario. Si un texto no coincide letra por letra, anótalo como **Rechazado**.

Marca cada caso: ☐ Aprobado  ☐ Rechazado. Anota la hora y, si falla, la captura y la línea de log correspondiente (ver la sección 5).

---

## 0. Antes de empezar

### 0.1 Dónde probar

> Las páginas `/sandbox` y `/configuracion-visor-sandbox` solo se ven con `SANDBOX_PAGE_ENABLED=true`; sin ella redirigen a `/api/health`.

> Registrar y consultar una incidencia dependen de `INCIDENCIAS_ENABLED=true` (por defecto apagada: solo están disponibles **Agendar una cita médica** y **Cita con referencia**). Los casos de esta guía que registran o consultan una incidencia, o que esperan sus filas en el menú, suponen la variable en `true`. Con ella apagada, esos mismos mensajes (`3`, `4`, `incidencia`, un código `MINSA-AAAA-NNNNNN` o `MINSA-AAAA-A-NNNNNN`) responden `Por ahora solo puedo ayudarte a agendar una cita médica o una cita con referencia.` y muestran el menú de dos filas, igual en los dos canales.

> Los términos y condiciones antes de la cita dependen de `TERMINOS_ENABLED=true` (por defecto apagada). Con ella encendida, toda entrada a **Agendar una cita médica** los muestra antes de pedir el documento (casos de la sección 3.20); apagada, la cita empieza como en el resto de esta guía.

> **Cita con referencia** no lleva bandera: está siempre disponible, con su fila en el menú de los dos canales (segunda, número `2`). También se entra escribiendo `referencia`, `cita con referencia` o `quiero consultar mi referencia`, o con un texto libre que la IA lea como un pedido de la referencia. Las referencias reales dependen de `SANDBOX_USE_REAL_MINSA=true` y del endpoint de MINSA; en modo fake la consulta siempre responde `No pudimos consultar tus referencias en este momento. Inténtalo de nuevo más tarde.` (ver la sección 3.18).

| Entorno | Cómo entrar | Para qué sirve |
|---|---|---|
| **Chat-bot (widget)** | `/sandbox` | Simula al ciudadano. No muestra el panel de depuración. |
| **Chat-bot (consola)** | `/configuracion-visor-sandbox` y el interruptor **Sandbox** (así se rotula hoy en la interfaz) | Igual, pero con el panel **Debug** a la derecha (visible en pantallas anchas) que muestra `from`, `state`, `slots` y `counters`, y con el botón **Reiniciar esta prueba** (reinicia solo la conversación de esa pestaña). **Úsalo para verificar los slots.** |
| **whatsapp-bot** | Tu número de prueba escribiendo al número del bot | Prueba el webhook completo: firma, base de datos, ritmo de mensajes y multimedia. |
| **Chat real** | `/configuracion-visor-sandbox` con el interruptor **Chat real** | Muestra las conversaciones guardadas. Sirve para comprobar que un mensaje rechazado NO creó una conversación. |

> **El token de MINSA nunca sale del servidor.** El panel solo recibe los slots de la lista blanca de `lib/constants/sandbox-visible-slots.ts`; no ve el token (`citaBearer`), los identificadores del código OTP, los documentos, los nombres ni los textos libres (`initialMessageText`, descripciones de incidencia). Para comprobar esos datos usa los logs `turn.end`, que los enmascaran (ver sección 4.4). El navegador solo guarda `sandbox-from` (`sandbox-` y un UUID v4 aleatorio).

### 0.2 Datos del modo fake (Chat-bot por defecto)

| Dato | Valor |
|---|---|
| DNI válido (8 dígitos, tipo `01`) | `12345678` |
| Carnet de extranjería válido (9 dígitos, tipo `03`) | `123456789` |
| Código OTP | `1234` |
| Distrito que resuelve | `Lurigancho` (es el único con ubigeo de prueba) |
| Especialidades | `MEDICINA GENERAL`, `ODONTOLOGIA` |
| Establecimiento | uno solo: `CENTRO DE SALUD LURIGANCHO` (se elige solo) |
| Fechas | los tres días siguientes en hora de Lima, mostradas como `AAAAMMDD` (ej. `20260920`). La tercera tiene un único horario (caso 3.17) |
| Horarios | `08:00 - 08:30`, `09:30 - 10:00`, `13:00 - 13:30` |

En **modo real** (variables `SANDBOX_USE_REAL_*` encendidas) los datos vienen de MINSA/Gemini y cambian cada día. Los casos marcados con ⚙ dependen de que el día tenga ese horario; si no lo tiene, anótalo como **No aplicable**, no como fallo.

### 0.3 Cómo saber si se usó IA

Sin mirar ningún panel de consumo:

| Si en pantalla aparece… | Significa |
|---|---|
| `Un momento, estamos revisando tu mensaje…` | Se consultó a la IA para entender la intención (en modo real: **1 llamada a Gemini**). |
| `Buscando tu distrito: "…"…` | Se consultó a la IA para el distrito. |
| Ninguno de los dos | Se resolvió **sin IA**. |

### 0.4 Qué es un «primer mensaje»

Un primer mensaje es el que llega **sin sesión abierta**.
- **Chat-bot:** abre una ventana de incógnito o pulsa **Reiniciar esta prueba** en la consola. Esto genera una sesión nueva.
- **Chat-bot, al abrirlo o recargar la página:** ya no se restaura la conversación anterior. Se cierra y empieza una nueva con la bienvenida. En la base, la fila anterior queda como registro cerrado: su `wa_id` pasa a `cerrada-<from anterior>-<marca de tiempo>` y conserva `estado`, `slots` y `contadores` (`fecha_modificacion` queda como fecha de cierre), para saber en qué paso terminó. **Reiniciar esta prueba** no borra esos registros cerrados ni las conversaciones de otras pestañas.
- **whatsapp-bot:** usa un número que nunca haya escrito antes. **El botón de reinicio no borra sesiones de whatsapp-bot.** Si tu número ya tiene sesión, los filtros de primer mensaje (sección 1) no se aplican: pide que borren tu fila de sesión o usa otro número.

### 0.5 Diferencias entre canales

| Comportamiento | Chat-bot | whatsapp-bot |
|---|---|---|
| Primer mensaje normal | Un saludo: la bienvenida, en **un solo mensaje** con el botón **Continuar mi cita**. Un pedido de cita o de incidencia: directo a ese flujo. Otro texto: el menú. Sin IA. | Igual (mismas reglas en los dos canales). |
| Menú y números escritos | Filas: cita, **Cita con referencia**, y las de incidencias con la bandera. Con incidencias encendidas: `1` cita, `2` referencia, `3` registrar, `4` consultar una incidencia; apagadas: `1` cita y `2` referencia. | Igual (misma lista y misma numeración). |
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
| 1.1a | Enviar el texto de 383 caracteres como **primer mensaje**. | Un solo mensaje de texto: `Mensaje no reconocido. El asistente del MINSA solo atiende solicitudes de citas médicas, consulta de referencias y registro de incidencias. Por favor elija una opción: [1] Citas [2] Referencia [3] Incidencias.` Sin bienvenida, sin botones, sin menú. | Sin IA. Sin escribir en la base: no crea conversación ni sesión. Sin candado. Log: `perimeter.rejected` con `reason: too_long` (solo whatsapp-bot). | ☐ ☐ |
| 1.1b | Enviar `('a' * 301)` como primer mensaje. | El mismo texto de rechazo. | Igual que 1.1a. | ☐ ☐ |
| 1.1c | Enviar `hola ` repetido 60 veces (300 caracteres, sin una letra repetida). | **No** se rechaza. Como no es un saludo ni un pedido, sale el menú `¿En qué podemos ayudarte hoy?` (whatsapp-bot y Chat-bot), sin bienvenida. | El límite es «más de 300». | ☐ ☐ |
| 1.1d | Tras 1.1a, enviar `Hola`. | Se comporta como primer contacto normal (bienvenida). | El rechazo no dejó sesión. | ☐ ☐ |
| 1.1e | **whatsapp-bot:** abrir **Chat real** tras 1.1a. | Tu número **no** aparece como conversación nueva. | Confirma que no se escribió nada. | ☐ ☐ |
| 1.1f | Con sesión abierta (ya en el flujo de incidencia, en el paso de la descripción), enviar el texto de 383 caracteres. | **No** se rechaza: el bot lo acepta como descripción de la incidencia (permite hasta 1000). | El filtro solo aplica al primer mensaje. | ☐ ☐ |
| 1.1g | Tras 1.1a, escribir `1` (y en otras pruebas `2` y `3`). | `1`: `¡Hola! Vamos a agendar tu cita. Para comenzar, por favor indícanos tu número de documento:`. `2`: `Para consultar tu referencia debes iniciar sesión. Ingresa tu número de documento.`. `3`: `¡Hola! Vamos a registrar tu incidencia. ¿En qué establecimiento de salud ocurrió? Escribe su nombre o su código IPRESS.`. | El texto de rechazo ofrece «[1] Citas [2] Referencia [3] Incidencias»: la respuesta numérica funciona sin menú previo. Sin IA. | ☐ ☐ |

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
| 1.2j | Con sesión abierta, dentro de la incidencia: `mi dirección está en https://maps.example.org/x` | **No** se rechaza; se guarda como parte de la incidencia. | Solo aplica al primer mensaje. | ☐ ☐ |

### 1.3 Spam, emojis repetidos y letras infinitas

> **Límite conocido:** el perímetro **no** filtra spam corto (menos de 300 caracteres y sin enlaces). Solo corta lo largo y lo que trae enlaces. Los casos 1.3b y 1.3d verifican que el bot **no se rompe**, no que lo bloquee.

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 1.3a | Primer mensaje: `GANA DINERO FACIL ` repetido 18 veces (324 caracteres). | Texto de rechazo de 1.1a. | Igual que 1.1a. | ☐ ☐ |
| 1.3b | Primer mensaje: `🔥🔥🔥💰💰💰` | Se rechaza con el texto de 1.1a (`Mensaje no reconocido…`). Sin bienvenida, sin menú. | Regla de repetición (seis emojis sin palabras). Sin IA, sin sesión. Log: `perimeter.rejected` con `reason: repeat`. | ☐ ☐ |
| 1.3c | Primer mensaje: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` (48 letras). | Se rechaza con el texto de 1.1a. | Regla de repetición (10 o más iguales seguidas). Log: `reason: repeat`. | ☐ ☐ |
| 1.3d | Con sesión abierta y en el menú: `🔥🔥🔥💰💰💰` | Aparece `Un momento, estamos revisando tu mensaje…` y luego el menú. | En modo real es **1 llamada a Gemini** (sale unclear y cae al menú). Sin errores. | ☐ ☐ |
| 1.3e | Primer mensaje: `👍` (y en otra prueba `jajajajaja` o `holaaaa`). | **No** se rechaza: sale el menú `¿En qué podemos ayudarte hoy?` (o la bienvenida con `holaaaa`). | Un solo emoji, la risa y un saludo alargado no son spam: el límite es 10 iguales seguidas o 6 emojis sin palabras. | ☐ ☐ |

### 1.4 Multimedia sin sesión — solo whatsapp-bot (excepto imagen)

Requiere un número **sin sesión** (ver 0.4).

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 1.4a | **whatsapp-bot:** enviar una **foto** como primer mensaje. | Solo texto: `Hola. Para iniciar su atención con el asistente del MINSA, por favor escriba un mensaje de texto con la palabra HOLA o seleccione una opción del menú.` | **No** descarga la foto (sin llamadas a Graph para media). Sin IA, sin base de datos, sin candado. Log: `... rejected a first message from ...NNNN: media`. | ☐ ☐ |
| 1.4b | **whatsapp-bot:** enviar un **sticker** como primer mensaje. | **Ninguna respuesta** (silencio total). | No descarga el sticker, no responde nada. Log: `... dropped a first message from ...NNNN: sticker`. | ☐ ☐ |
| 1.4c | **whatsapp-bot:** enviar una **nota de voz** como primer mensaje. | El mismo texto. | Igual. | ☐ ☐ |
| 1.4d | **whatsapp-bot:** enviar un **video** o un **documento** como primer mensaje. | El mismo texto. | Igual. | ☐ ☐ |
| 1.4e | **Chat-bot:** tras reiniciar, pulsar 📎 y adjuntar una imagen como primer mensaje. | El mismo texto. | Igual. | ☐ ☐ |
| 1.4f | Tras 1.4a, enviar `Hola`. | Primer contacto normal (bienvenida). | El rechazo no dejó sesión. | ☐ ☐ |
| 1.4g | Con sesión, en el paso «¿Quieres enviar *imágenes* como evidencia?» de la incidencia, enviar una foto (y en otra prueba un PDF). | Foto: `Recibimos tu imagen (1 de 5): se guardó. Puedes enviar más o tocar *Listo* para continuar.` con **[Listo]**. PDF: `Solo aceptamos imágenes JPG o PNG de hasta 5 MB; ese archivo no se guardó. Puedes enviar otra imagen o tocar *Omitir* para continuar sin ella.` con **[Omitir]**. | La foto queda en la sesión hasta registrar; el PDF no se guarda y no se da por registrado. Un sticker o un audio en ese paso recibe el aviso de 1.4h. | ☐ ☐ |
| 1.4h | **whatsapp-bot:** con sesión abierta (por ejemplo, en el menú o a mitad de una cita), enviar una **nota de voz**, un **sticker** o una **ubicación**. | `Por ahora solo puedo leer texto e imágenes. Escríbeme tu mensaje, por favor.` | La sesión no cambia y no corre ningún turno. Log: `webhook.unsupported_message` con `messageType` y `state`. Después, escribir la respuesta en texto continúa el flujo donde estaba. | ☐ ☐ |

### 1.5 Inundación (rate limiting) — solo whatsapp-bot

> ⚠ **Prueba con un número secundario.** La sanción por exceso se mantiene **1 hora** y ese número no podrá conversar. Se guarda en memoria de la instancia: se libera a la hora o al reiniciar/desplegar.

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 1.5a | Enviar `hola` **6 veces en menos de 10 segundos** (copia el texto y pulsa enviar rápido). | Se atienden los primeros 5. Al sexto llega **un solo aviso**: `Está enviando mensajes muy rápido. Por favor, espere 2 minutos y vuelva a escribirnos.` Del séptimo en adelante: ningún mensaje (silencio). | El sexto silencia el número **2 minutos** y es el único que recibe respuesta; el resto se descarta sin base de datos ni IA. Meta recibe igualmente su 200 (no reintenta). Logs: `perimeter.muted` (una vez) y `perimeter.dropped` con `reason: throttled` por cada mensaje descartado (`noticeSent: true` en el sexto). | ☐ ☐ |
| 1.5b | Esperar 10 segundos y enviar `hola`. | **Sigue sin responder** y **sin repetir el aviso**: el número está silenciado 2 minutos. | El silencio dura más que la ventana de 10 s. El aviso de 1.5a solo sale una vez por silencio. | ☐ ☐ |
| 1.5c | Enviar mensajes sostenidos hasta pasar de 20 en un minuto (uno cada 2–3 s durante un minuto). | El bot deja de responder. Sigue en silencio aunque escribas tras unos minutos. | Sanción de 1 hora. Log: `perimeter.banned` (1 hora, más de 20 mensajes en 60 s). | ☐ ☐ |
| 1.5d | Escribir con **otro** número mientras el primero está sancionado. | El segundo número responde normalmente. | La sanción es por número, no global. | ☐ ☐ |
| 1.5e | Esperar **2 minutos** desde la ráfaga de 1.5a y enviar `hola`. | Vuelve a responder con normalidad. | El silencio terminó. Si en esos 2 minutos se insistió hasta pasar de 20 mensajes en 60 s, en cambio, aplica la sanción de 1 hora (1.5c). | ☐ ☐ |
| 1.5f | Llegar al paso de la evidencia de la denuncia, seleccionar **5 imágenes** juntas, enviarlas y tocar **Listo** enseguida. | El bot responde a las imágenes y el toque de **Listo** pasa al resumen. **No** llega el aviso `Está enviando mensajes muy rápido…`. | Las imágenes de ese paso se cuentan aparte: hasta 6 en 10 s, y la de más se descarta sin aviso (`perimeter.dropped`, `messageType: image`). No gastan el cupo de 5 mensajes en 10 s, por eso Listo pasa. Más de 20 imágenes en 60 s siguen bloqueando el número 1 hora. Fuera de ese paso las imágenes cuentan como cualquier mensaje. | ☐ ☐ |

### 1.6 Firma del webhook (Paso 0) — solo con herramientas

| # | Acción | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 1.6a | Enviar un `POST` a `/webhook/whatsapp` **sin** la cabecera `x-hub-signature-256` (por ejemplo con `curl -X POST -d '{}' <url>`). | HTTP **403** `Forbidden`. Ningún mensaje al ciudadano. | No se crea conversación, mensaje ni sesión; no hay línea `turn.start` en los logs. | ☐ ☐ |
| 1.6b | Repetir con una firma inventada (`sha256=` y 64 ceros). | HTTP **403**. | Igual que 1.6a. La comparación de la firma es en tiempo constante. | ☐ ☐ |
| 1.6c | Con `META_APP_SECRET` vacía (reiniciar el proceso), enviar un `POST` firmado con una clave vacía. | HTTP **403**. | Log `webhook.signature_secret_missing`; `/api/health` responde `degraded` con `META_APP_SECRET_MISSING`. | ☐ ☐ |
| 1.6d | Enviar un `POST` a `/api/sandbox` con un `from` que no empieza con `sandbox-` (por ejemplo un número de WhatsApp real). | HTTP **400** `INVALID_BODY`. | No se lee ni se escribe ninguna sesión: el Chat-bot no puede hablar en nombre de un ciudadano de WhatsApp. | ☐ ☐ |

### 1.7 Texto de más de 1000 caracteres — solo Chat-bot

Vale con la sesión abierta en cualquier paso. Para generar 1000 y 1001 caracteres en PowerShell: `('a' * 1000) | clip` y `('a' * 1001) | clip`.

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 1.7a | Pegar `('a' * 1000)` en la caja de texto y enviar. | **Sin** aviso. El mensaje sale completo y el bot responde como a cualquier texto. | El límite es «más de 1000», el mismo que la descripción de la incidencia. | ☐ ☐ |
| 1.7b | Pegar `('a' * 1001)` en la caja de texto. | La caja se queda con 1000 caracteres y aparece el aviso rojo sobre la caja: `No podemos procesar tu mensaje: reduce la cantidad de caracteres (máximo 1000).` | El navegador no corta en silencio: el corte y el aviso salen del mismo cambio. El aviso se borra al enviar el siguiente mensaje. | ☐ ☐ |
| 1.7c | Con 1000 caracteres escritos, teclear una letra más. | El mismo aviso; la caja sigue con 1000. | Igual que 1.7b. | ☐ ☐ |
| 1.7d | **Con herramientas:** enviar un `POST` a `/api/sandbox` con `text` de 1001 caracteres (firmado si `SANDBOX_SHARED_SECRET` está definida). | HTTP **422** con `{ "error": "TEXT_TOO_LONG", "message": "No podemos procesar tu mensaje: reduce la cantidad de caracteres (máximo 1000)." }`. | El servidor valida aunque el cliente ya corte; no corre el turno ni escribe en la base. | ☐ ☐ |

---

## 2. Filtro léxico (los 3 caminos)

Si no se indica lo contrario, envía cada texto **en el menú** (con sesión ya abierta). Para asegurarte, escribe primero `Hola`.

Mensaje de advertencia (`A`):
`Le recordamos que este es un canal institucional oficial del MINSA y mantenemos una política de respeto. Si desea registrar una incidencia sobre un mal servicio de salud, escriba INCIDENCIA para iniciar el trámite oficial.` con el botón **[Continuar]**. Es el texto con `INCIDENCIAS_ENABLED=true`; apagada, el aviso se reduce a la primera frase (la política de respeto).

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
| 2.1i | Tras 2.1a, tocar **Continuar**. | El menú `¿En qué podemos ayudarte hoy?` con las filas **Agendar una cita médica**, **Cita con referencia** y **Registrar una incidencia** (con `INCIDENCIAS_ENABLED=true`; apagada, solo **Agendar una cita médica** y **Cita con referencia**). | Vuelve al menú sin IA. | ☐ ☐ |
| 2.1j | Tras 2.1a, escribir `RECLAMO`. | `¿En qué establecimiento de salud ocurrió? Escribe su nombre o su código IPRESS.`. | La palabra que promete la advertencia funciona. Sin IA. | ☐ ☐ |
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

### 2.3 Agresión con queja → derivación al flujo de incidencia

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 2.3a | `posta de mrda pésima atención del doctor` | Con un número que nunca autorizó: el pedido de autorización (whatsapp-bot: un mensaje con el aviso de privacidad, `¿Autorizas el tratamiento de tus datos?` y **[Sí, autorizo]** **[No autorizo]**; Chat-bot: el modal **Autorización de datos**), con `Lamentamos lo ocurrido.` delante. Al autorizar, **un solo mensaje** con `⚠️ ESTE CANAL NO ATIENDE EMERGENCIAS MÉDICAS` … `- *SAMU: 106* (ambulancias y emergencias médicas)` `- *Bomberos: 116* (rescate y urgencias)`, **sin** `Acuda ahora mismo…` y `Vamos, cuéntame, ¿en qué establecimiento de salud ocurrió? *Escribe su nombre o su código IPRESS*.`. Si ya había autorizado, ese mensaje llega directo, con `Lamentamos lo ocurrido.` delante. **No** aparece el mensaje `A`. | **Sin IA.** Va directo a la denuncia (primero `incidencia_consent_check_pending`). El usuario no queda bloqueado. | ☐ ☐ |
| 2.3b | `Doctora imbécil no me dio mi medicina` | Igual que 2.3a. | Sin IA. | ☐ ☐ |
| 2.3c | Tras 2.3a, responder `omitir`, tocar **Sí, continuar** (aparece `Entendido, seguiremos sin indicar el establecimiento. ¿Deseas registrar tu denuncia con tu número de documento o prefieres que sea anónima?`) y **Prefiero ser anónimo** (aparece `Entendemos tu preferencia por el anonimato. Cuéntame tu denuncia (*hasta 1000 caracteres*).`, sin volver a pedir la autorización) y escribir `El doctor fue un idiota y me trató pésimo`. | Se acepta y avanza al pedido de evidencia, que empieza con `¿Quieres enviar *imágenes* como evidencia? Es *opcional*.`, con el botón **[Omitir]**. | En la descripción de la incidencia **el insulto nunca se bloquea** (es evidencia). | ☐ ☐ |

### 2.4 Agresión con cita → advertencia y se conservan los datos

Usa el **panel Debug** de la consola para ver los `slots`.

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 2.4a | `Apúrense cojudos quiero cita de odontología en Lurigancho` | `Le recordamos que este es un canal institucional oficial del MINSA y mantenemos una política de respeto. Continuemos con tu cita: ingresa tu número de documento.` | **Sin IA.** Debug: `state: cita_awaiting_dni` y `slots` con `citaEspecialidadHintText: "Odontología"` y `citaDistritoHintText: "Lurigancho"`. **No** aparece `initialMessageText` en `slots` del log `turn.end`. | ☐ ☐ |
| 2.4b | `12345678` | `Validando tu documento…` y `Te enviamos un código a tu teléfono o correo registrado. Escríbelo en el siguiente mensaje.` | Valida el DNI. | ☐ ☐ |
| 2.4c | `1234` | Toda esta secuencia **en una sola respuesta**: `Verificando código…`, `Buscando tu ubigeo…`, `Entendido. Buscando especialidades y citas disponibles en *Lurigancho*…`, `Especialidad detectada: ODONTOLOGIA. Buscando establecimientos…`, `Establecimiento encontrado: CENTRO DE SALUD LURIGANCHO. Buscando fechas disponibles…` y la lista `Selecciona la fecha:`. | **No vuelve a preguntar el distrito ni la especialidad**: eso demuestra que se conservaron. Sin IA en toda la cadena. | ☐ ☐ |
| 2.4d | Repetir 2.4a con `en San Borja` en vez de `en Lurigancho`. | Igual en 2.4a. En modo **fake**, tras el OTP dice `No encontramos ese ubigeo. Indícanos nuevamente el departamento.` (el catálogo de prueba no conoce San Borja). En modo **real** sigue de largo. | Buscó «San Borja» sin preguntarlo: el dato se conservó. | ☐ ☐ |

### 2.5 Estrés — jerga, hostilidad y datos en medio del flujo

Nacida de un dataset de 300 casos con jerga peruana (`tmr`, `webon`, `causa`,
`al toque`, etc.) diseñado para probar 4 mecanismos: normalización de jerga,
supervivencia de la intención de cita bajo `CITA_WITH_WARNING`, extracción de
distrito/especialidad en medio del flujo ignorando ruido, y aislamiento del
texto hostil del contexto que alimenta IA. Cada subsección aísla una sola
variable — no repite la misma señal con 50 distritos distintos.

**2.5.1 — Hostilidad + dato reconocible, primer mensaje (el camino que ya
funciona, confirmación con otros distritos/especialidades).** Usa el panel
Debug.

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 2.5.1a | `oe hdp dame mi cita de cardiología en Surco` (primer mensaje) | Mensaje `A` (recordatorio) + `Continuemos con tu cita: ingresa tu número de documento.` | Debug: `citaEspecialidadHintText: "Cardiología"`, `citaDistritoHintText: "Surco"`. | ☐ ☐ |
| 2.5.1b | `imbeciles atiendanme, cita de pediatría en San Isidro` (primer mensaje) | Igual que 2.5.1a. | Debug: `citaEspecialidadHintText: "Pediatría"`, `citaDistritoHintText: "San Isidro"`. | ☐ ☐ |
| 2.5.1c | `cojudos necesito cita de dermatología en Barranco` (primer mensaje) | Igual que 2.5.1a. | Debug: `citaEspecialidadHintText: "Dermatología"`, `citaDistritoHintText: "Barranco"`. | ☐ ☐ |

**2.5.2 — Hostilidad + distrito abreviado (SJL/VMT/SJM), primer mensaje.**
El resolvedor de distritos solo hace match exacto o por prefijo contra el
nombre oficial completo (`lib/fsm/flows/cita/ubigeo-data.ts`) — no existe una tabla de
abreviaturas en todo el repo. Se espera que la advertencia SÍ aparezca (el
insulto y la palabra "cita" sí se reconocen), pero que el hint de distrito
**no** se guarde.

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 2.5.2a | `oe hdp cita en sjl` (primer mensaje) | Mensaje `A` + pide el documento, igual que 2.5.1. | Debug: **sin** `citaDistritoHintText` (gap conocido: "sjl" no es el nombre oficial ni su prefijo). | ☐ ☐ |
| 2.5.2b | `imbeciles denme cita en vmt` (primer mensaje) | Igual que 2.5.2a. | Sin `citaDistritoHintText`. | ☐ ☐ |
| 2.5.2c | `cojudos cita en sjm` (primer mensaje) | Igual que 2.5.2a. | Sin `citaDistritoHintText`. | ☐ ☐ |

**2.5.3 — Jerga peruana ausente del diccionario (falso negativo).**
`lib/security/lexicon.ts` no tiene `tmr`, `webon` ni `gil` (ni por fuzzy:
`gil` tiene 3 letras, bajo el mínimo de 5; `webon` no coincide con `huevon`
porque exige la misma primera letra). Se espera que pasen como texto normal,
**sin** advertencia.

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 2.5.3a | `tmr` (con sesión, tras `Hola`) | El menú `¿En qué podemos ayudarte hoy?`. **Sin** mensaje `A`. | `evaluateLexicalGuard` devuelve `ALLOW` — gap confirmado, no arreglar en esta pasada. | ☐ ☐ |
| 2.5.3b | `webon` | Igual que 2.5.3a. | `ALLOW`. | ☐ ☐ |
| 2.5.3c | `gil` | Igual que 2.5.3a. | `ALLOW`. | ☐ ☐ |

**2.5.4 — Hostilidad en medio del flujo, estado CON guard
(`cita_awaiting_distrito_ai`).** El guard, en este estado, descarta el
mensaje completo y repite la pregunta — nunca llega a
`extractCitaHints`/`resolveDistritoText` esa vuelta, sin importar si la
acción interna es `DROP_AND_WARN`, `CITA_WITH_WARNING` o `FORCE_INCIDENCIA`
(`lib/fsm/routing/lexical-guard-routing.ts:116`). Llega hasta aquí con `reachDistritoPrompt`.

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 2.5.4a | `hdp no jodas, san juan de lurigancho` | Mensaje `A` (recordatorio) + repite `Cuéntanos en qué distrito buscas atención`. **No** avanza a especialidad. | El distrito nombrado se pierde esa vuelta pese a ser válido. | ☐ ☐ |
| 2.5.4b | `cojudos apurense, cita en surco` | Igual que 2.5.4a, aunque el mensaje sí tiene la palabra "cita" (internamente sería `CITA_WITH_WARNING`). | Confirma que en medio del flujo el tipo de acción no cambia el resultado: siempre se descarta. | ☐ ☐ |
| 2.5.4c | `posta de mrda, en comas` | Igual que 2.5.4a (repite la pregunta de distrito). | Internamente sería `FORCE_INCIDENCIA` (hay palabra de salud "posta" sin "cita"), pero en medio del flujo **no** deriva a Reclamos: se queda pidiendo el distrito. Vale la pena decidir si esto es lo deseado. | ☐ ☐ |

**2.5.5 — Hostilidad en medio del flujo, estado SIN guard
(`cita_awaiting_hora_confirm`).** Este estado no está en `FREE_TEXT_STATE_PROMPTS`
ni en `SELECTION_STATES` (`lib/fsm/routing/lexical-guard-routing.ts:26-43`): el guard nunca corre
aquí. Si el texto ruidoso igual matchea la hora pendiente
(`acceptsPendingHora`, `lib/fsm/flows/cita/steps/hora/confirm.ts:17-24`), la cita se
confirma **sin ninguna advertencia**. Llega hasta aquí con
`reachHorarioList` + `"8"` (deja `citaHoraConfirmId` en `08:00|...`).

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 2.5.5a | `a las 8 pe hdp` | `Agendando tu cita…` directo. **Sin** mensaje `A` ni recordatorio en ningún punto de la secuencia. | Bypass confirmado: el insulto nunca pasa por el guard porque el estado no está en ninguna lista. | ☐ ☐ |
| 2.5.5b | `imbeciles a las 8 nomas` | Igual que 2.5.5a. | Mismo bypass con otra frase. | ☐ ☐ |

**2.5.6 — Hora/fecha coloquial sin soporte hoy.** `time-parser.ts` no tiene
regla para "tempranito" ni "después del almuerzo" (solo entiende dígitos,
`am`/`pm`, `tarde`/`noche`/`mediodia`/`medianoche` y las frases exactas "lo
más pronto"/"lo más temprano"). `date-parser.ts` no expande contracciones
("pal" → "para el"), así que "pal 15" no matchea `\b(?:dia|el)\s+(\d{1,2})\b`.

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 2.5.6a | En la lista de horarios, escribir `después del almuerzo` | `Selecciona una opción de la lista.` + repite la lista de horarios. **Confirmado con log** (corrida 2026-09-22T15-08-02). | `matchHoraText` devuelve `unparsed`. | ☐ ☐ |
| 2.5.6b | En la lista de fechas, escribir `pal 15` | `Selecciona una opción de la lista.` + repite la lista de fechas. **Confirmado con log**. | `matchFechaText` devuelve `unparsed` (no hay expansión de "pal"). | ☐ ☐ |

---

## 3. Camino feliz de punta a punta (cita por texto y botones)

Empieza de cero (0.4). Todos los datos son del modo fake (0.2).

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 3.1a | `Hola` (sesión nueva). | **whatsapp-bot:** un solo mensaje, la bienvenida grande con el botón **[Continuar mi cita]** y, al final del texto, `¿Prefieres seguir por aquí mismo? Escríbeme lo que necesitas y te ayudo.` Incluye la línea `⚠️ En caso de emergencia médica, llama al *106* (SAMU).` **Chat-bot (widget web):** un solo mensaje de texto, sin botón, que se presenta como «el asistente virtual de MINSA Digital» y termina en `Escríbeme lo que necesitas y te ayudo.`; también incluye la línea del *106*. En ambos casos: **sin** segundo mensaje y **sin** el menú `¿En qué podemos ayudarte hoy?`. | Distinto texto/formato según canal (`session.channel`: `whatsapp` vs `web`), ver `lib/fsm/routing/welcome.ts`. **Sin IA:** no aparece «Un momento…». La sesión queda en `main_menu`. | ☐ ☐ |
| 3.1b | Tras 3.1a, escribir `hola` (o `1`). | Recién ahora: el menú `¿En qué podemos ayudarte hoy?` con las filas **Agendar una cita médica**, **Cita con referencia**, **Registrar una incidencia** y **Consultar una incidencia** (con `INCIDENCIAS_ENABLED=true`; apagada, solo **Agendar una cita médica** y **Cita con referencia**). Si en cambio se escribe un pedido (`quiero una cita en Miraflores de odontología`), va directo al DNI. | El menú depende de la respuesta del ciudadano, no del primer mensaje. Sin IA para el saludo. | ☐ ☐ |
| 3.1c | Con **sesión nueva**, primer mensaje: `Sabes quiero una cita para san Juan de Lurigancho para medicina general`. | **Un solo mensaje:** `¡Hola! Te ayudaremos a agendar tu cita de Medicina General en San Juan de Lurigancho. Para comenzar, por favor indícanos tu número de documento:`. **Sin** bienvenida ni menú. | Sin IA. Slots (panel Debug): `citaDistritoHintText` = `San Juan de Lurigancho`, `citaEspecialidadHintText` = `Medicina General`. Reiniciar antes de seguir con 3.2. | ☐ ☐ |
| 3.1d | Con **sesión nueva**, primer mensaje: `Quiero poner una queja`. | Con un número que nunca autorizó: el pedido de autorización (whatsapp-bot: un mensaje con el aviso de privacidad, `¿Autorizas el tratamiento de tus datos?` y **[Sí, autorizo]** **[No autorizo]**; Chat-bot: el modal **Autorización de datos**), con `¡Hola!` delante. Al autorizar, **un solo mensaje** con `⚠️ ESTE CANAL NO ATIENDE EMERGENCIAS MÉDICAS` … `- *SAMU: 106* (ambulancias y emergencias médicas)` `- *Bomberos: 116* (rescate y urgencias)`, **sin** `Acuda ahora mismo…` y `Vamos, cuéntame, ¿en qué establecimiento de salud ocurrió? *Escribe su nombre o su código IPRESS*.`, sin repetir `¡Hola!`. Si ya había autorizado, ese mensaje llega directo con `¡Hola!` delante. Sin bienvenida ni menú. | Sin IA. Estado `incidencia_awaiting_ubicacion`. Reiniciar antes de seguir. | ☐ ☐ |
| 3.1e | Con **sesión nueva**, primer mensaje: `necesito hablar con alguien`. | El menú `¿En qué podemos ayudarte hoy?` con **Agendar una cita médica**, **Cita con referencia** y **Registrar una incidencia** (con `INCIDENCIAS_ENABLED=true`; apagada, solo **Agendar una cita médica** y **Cita con referencia**). **Sin** bienvenida. | Sin IA. El texto queda como primer mensaje para usarlo de contexto en el distrito. Reiniciar antes de seguir. | ☐ ☐ |
| 3.1f | Con **sesión nueva**, primer mensaje (el del QR): `Hola quiero presentar una incidencia HOSPITAL NACIONAL DOS DE MAYO - CODIGO-IPRESS 6206`. | Primero el pedido de autorización (whatsapp-bot: un mensaje con el aviso de privacidad, `¿Autorizas el tratamiento de tus datos?` y **[Sí, autorizo]** **[No autorizo]**; Chat-bot: el modal **Autorización de datos**), si el número nunca autorizó. Luego **un solo mensaje** con botones: `⚠️ ESTE CANAL NO ATIENDE EMERGENCIAS MÉDICAS` … `- *SAMU: 106* (ambulancias y emergencias médicas)` `- *Bomberos: 116* (rescate y urgencias)`, **sin** `Acuda ahora mismo…`, `¿Estás seguro de esa ubicación?` y **HOSPITAL NACIONAL DOS DE MAYO**, `Código IPRESS: 6206`, **[Sí, es ese]** **[No, es otro]**. Sin bienvenida ni menú. | Entrada por QR: requiere base de datos con los hospitales cargados (`SELECT catalogo.cargar_hospitales_fase_1();`). Sin IA. | ☐ ☐ |
| 3.1v | **Chat-bot**, con un `from` que nunca autorizó: tocar **Registrar una incidencia**. | Un globo `Para registrar tu denuncia necesitamos tu autorización.` y se abre el modal **Autorización de datos** con el aviso de privacidad, **[Acepto, autorizo mis datos]** y **[No autorizo]**. Cerrarlo deja el botón **[Revisar autorización]**, que lo vuelve a abrir. Al aceptar sigue un solo mensaje con el aviso de emergencia y la pregunta del establecimiento. | Es el mismo efecto de consentimiento que el de los términos (`send_consent`), sin casilla. Estado `incidencia_consent_choice` mientras se espera. | ☐ ☐ |
| 3.1w | Con el mismo número (o `from`) de 3.1v, empezar otra denuncia. | No vuelve a pedir la autorización: llega directo el mensaje del aviso con la pregunta del establecimiento. | Con base, la autorización queda en `chatbot.usuario.consentimiento_aceptado_en`; con `DATABASE_ENABLED=false`, en la memoria del proceso (se vuelve a pedir tras reiniciar). | ☐ ☐ |
| 3.1x | Con un número que nunca autorizó, empezar una denuncia y tocar **No autorizo** (o escribir `no autorizo`). | `Entendido. No se registrará tu denuncia por este canal…` | Termina sin pedir el establecimiento y sin guardar nada. | ☐ ☐ |
| 3.1o | En cualquier paso de una incidencia, escribir `quiero cerrar`. | `Entendido, no se registró ninguna incidencia…`. Un mensaje nuevo empieza de cero. | Cancela sin guardar nada. Un relato que contiene la frase no cancela. | ☐ ☐ |
| 3.1p | En el paso del relato escribir `me cobraron` (menos de 20 caracteres). | `Cuéntanos un poco más: escribe al menos 20 caracteres para poder entender lo que pasó.` | No avanza ni guarda. | ☐ ☐ |
| 3.1p2 | **whatsapp-bot**, en el paso del relato: pegar un texto de 1200 caracteres. | `Tu mensaje tiene 1200 caracteres; el máximo es 1000. Resúmelo y envíalo de nuevo.` (con el número real de caracteres). | No avanza ni guarda. Con **Agregar más** sobre un borrador, si la suma pasa de 1000: `Con lo que agregaste, tu denuncia tendría N caracteres; el máximo es 1000. Resúmelo y envíalo de nuevo.` | ☐ ☐ |
| 3.1q | Registrar 5 incidencias con el mismo teléfono (o `from` del Chat-bot) y una sexta el mismo día. | La sexta: `Hoy ya registraste el máximo de incidencias permitido. Podrás registrar otra mañana. Gracias por tu comprensión.` | Tope provisional de 5 por día (hora de Lima). | ☐ ☐ |
| 3.1l | Con el flujo de 3.1f y 3.1g, elegir **Prefiero ser anónimo** (pasa directo al relato), escribir un relato de más de 20 caracteres y responder `omitir`. | Tras tocar **Registrar**, **un solo mensaje** (sin `Enviando tu denuncia…`): `¡Gracias! Tu denuncia quedó registrada con el código *MINSA-AAAA-A-NNNNNN* en *HOSPITAL NACIONAL DOS DE MAYO*. Guárdalo: para ver su estado, elige *Consultar mi denuncia* en el menú o escribe tu código. ¡Hasta pronto!` | La incidencia queda en la base con el establecimiento. El código es el que asigna la base: por ser anónima lleva la serie `A`. En whatsapp-bot se ve el indicador de escritura mientras se registra. | ☐ ☐ |
| 3.1l2 | Igual que 3.1l, pero con **Con mi documento** (`12347453`). | El mismo mensaje con el código sin serie `A` y, antes de `¡Hasta pronto!`, `Si el área responsable necesita información adicional, se comunicará contigo.` | `es_anonimo = false` y `dni_reclamante` con el documento. | ☐ ☐ |
| 3.1l3 | Con la base apagada o caída, llegar a **Registrar** y tocarlo. | `Lo sentimos, no pudimos registrar tu denuncia en este momento. Por favor, inténtalo de nuevo más tarde.` | No se guarda nada; la sesión queda en `incidencia_failed`. | ☐ ☐ |
| 3.1l4 | **Chat-bot**: registrar una denuncia completa (anónima o con documento). | El mismo cierre de 3.1l. | En la base, `chatbot.incidencia_paciente.canal_origen_id` = 2 (web). Una denuncia de whatsapp-bot queda con 1 (WhatsApp). | ☐ ☐ |
| 3.1m | Con **sesión nueva** y sin indicar el establecimiento (3.1j), seguir hasta el final. | `¡Gracias! Tu denuncia quedó registrada con el código *MINSA-AAAA-A-NNNNNN*. Guárdalo: para ver su estado, elige *Consultar mi denuncia* en el menú o escribe tu código. ¡Hasta pronto!` (sin «en *X*»). | Se guarda con `establecimiento_id` nulo. | ☐ ☐ |
| 3.1n | Con **Con mi documento**, escribir un número de 9 dígitos (y en otra prueba uno de 8). | Ambos pasan directo al relato (`Cuéntame tu denuncia, documento ****NNNN (*hasta 1000 caracteres*).`, con los cuatro últimos dígitos del documento), **sin** volver a pedir la autorización, **sin** `Verificando tu documento…`, sin saludo con nombre y sin pedir nombre ni alias. | El tipo se infiere por el largo: 8 = DNI, 9 = carnet de extranjería. No se consulta ningún servicio. | ☐ ☐ |
| 3.1n2 | Con **Con mi documento**, escribir `1234567`, `abcdefgh` y un número de 13 dígitos. | Cada vez: `Documento inválido. Debe tener 8 dígitos (DNI) o 9 dígitos (carnet de extranjería). Intenta de nuevo.` con **[Continuar anónimo]**. | No avanza ni guarda nada. | ☐ ☐ |
| 3.1n3 | whatsapp-bot, con base de datos: en el paso de la evidencia, seleccionar **3 imágenes** en la galería y enviarlas juntas; luego tocar **Listo**. | **Una sola respuesta**: `Recibimos 3 imágenes (3 de 5): las 3 se guardaron. Puedes enviar más o tocar *Listo* para continuar.` con **[Listo]**. Al tocar Listo, el resumen incluye `Imágenes adjuntas: 3`. | Sin base de datos no hay agrupador: una respuesta por imagen. | ☐ ☐ |
| 3.1n4 | whatsapp-bot: enviar juntas **5 imágenes**. | **2 mensajes del bot en total** desde el pedido de evidencia: el pedido y un único mensaje que empieza con `Recibimos 5 imágenes (5 de 5): las 5 se guardaron.` y sigue con el resumen y **[Registrar] [Cancelar]**. | Antes eran 7 (el pedido, 5 acuses y el resumen aparte). | ☐ ☐ |
| 3.1n5 | whatsapp-bot: enviar juntas una imagen válida, una de más de 5 MB, un GIF y una imagen ya enviada antes. | Una respuesta: `Recibimos 4 imágenes (2 de 5): 1 se guardó y 3 no, porque 1 pesa más de 5 MB, 1 no es una imagen JPG o PNG válida y 1 ya la habías enviado.` (el orden de los motivos sigue el de las imágenes) con **[Listo]**. | Si ninguna se guarda y no había otras, el botón es **[Omitir]**. | ☐ ☐ |
| 3.1n6 | whatsapp-bot: mientras suben 3 imágenes, escribir `listo`. | No se pierde ningún mensaje: primero el acuse de las imágenes y después el resumen para registrar. | Antes, un texto que llegaba junto con una imagen se descartaba. | ☐ ☐ |
| 3.1n7 | Con `EVIDENCE_IMAGE_MAX_MB=2` (reiniciar el proceso), llegar al paso de la evidencia y enviar una imagen de 3 MB por whatsapp-bot y por el Chat-bot. | El pedido dice `hasta *2 MB* cada una`. whatsapp-bot: `Recibimos tu imagen (0 de 5): no se guardó, porque pesa más de 2 MB.`… El Chat-bot no la envía y avisa `La imagen supera el tamaño máximo permitido (2 MB). Envía una imagen más liviana.` | Con `0`, `9` o `abc` vale 5 MB y `/api/health` responde `degraded` con `EVIDENCE_IMAGE_MAX_MB_INVALID`. | ☐ ☐ |
| 3.1g | Tras 3.1f, tocar **Sí, es ese**. | **Un solo mensaje:** `Perfecto, registraremos tu denuncia en *HOSPITAL NACIONAL DOS DE MAYO*. ¿Deseas registrarla con tu número de documento o prefieres que sea anónima?` con **[Con mi documento]** **[Prefiero ser anónimo]**. | El establecimiento queda en la sesión (todavía no se guarda en la incidencia). | ☐ ☐ |
| 3.1h | Con **sesión nueva**, primer mensaje: `Hola quiero presentar una incidencia C.S.M. COMUNITARIO LINCE - CODIGO-IPRESS 38137`. | Pregunta de confirmación con **C.S.M. COMUNITARIO LINCE**. **No** aparece la advertencia de respeto. | «C.S.M.» no se toma por un insulto: lo precargado por el QR no pasa por el filtro de insultos. | ☐ ☐ |
| 3.1i | Con **sesión nueva**, primer mensaje: `quiero presentar una incidencia en el hospital`. | Una lista `Encontré estos establecimientos. Elige el correcto:` con los 4 hospitales (filas `IPRESS 6206`, `5946`, `6215`, `33381`) y **Ninguno de estos**. | Solo el tipo: se ofrece la lista corta. Elegir una fila sigue con la pregunta del nombre. | ☐ ☐ |
| 3.1r | Registrar una incidencia (3.1l) y, con el mismo WhatsApp y **sesión nueva**, escribir `quiero ver mi incidencia MINSA-AAAA-A-NNNNNN` (el código recibido). | `Incidencia MINSA-AAAA-A-NNNNNN`, `Estado: Recibida, pendiente de revisión` y `Fecha de registro: dd/mm/aaaa`. **Sin** descripción ni datos de la persona. La sesión termina: un mensaje nuevo vuelve al inicio. | Sin IA. Requiere base de datos y `INCIDENCIAS_ENABLED=true`; apagada, responde el aviso de que solo se agendan citas. En whatsapp-bot se compara el usuario dueño de la incidencia. | ☐ ☐ |
| 3.1s | Desde **otro** WhatsApp, escribir el mismo código; y desde el primero un código inexistente (`MINSA-2026-999999`). | Ambos: exactamente `No se logró ubicar el registro de la incidencia.` | No se distingue «ajena» de «no existe». | ☐ ☐ |
| 3.1t | En el menú tocar **Consultar una incidencia** (o escribir `3` en whatsapp-bot, `4` en el Chat-bot), responder `123` y luego tres textos sin formato de código. | `Escribe el código de tu incidencia (por ejemplo, MINSA-2026-000001).`; luego `El código no tiene el formato correcto. Debe verse así: MINSA-2026-000001. Intenta de nuevo.`; al tercer intento `No pudimos reconocer el código. Revísalo e inicia la consulta nuevamente.` | Tope de 3 intentos; la sesión termina. | ☐ ☐ |
| 3.1u | **Chat-bot** (sesión nueva): escribir un código válido de una incidencia con DNI. | Pide el documento, luego el OTP (`12345678` y `1234` en modo fake) y responde el estado. Con una incidencia anónima: `No se logró ubicar el registro de la incidencia.` | Solo la web exige DNI + OTP. Con la base apagada: `Disculpa, no podemos consultar tu incidencia en este momento. Inténtalo más tarde.` | ☐ ☐ |
| 3.1j | Con **sesión nueva**, primer mensaje: `quiero presentar una incidencia`. Responder tres veces con textos que no son un establecimiento (`xyzzy`, `qwerty`, `zzzz`). | Tras el tercero: `Disculpa, no logramos ubicar el establecimiento. ¿Quieres continuar sin indicar el establecimiento?` con **[Sí, continuar]** **[No, indicarlo]**. | Con «Sí» sigue con la pregunta del nombre, sin establecimiento. | ☐ ☐ |
| 3.1k | Con **sesión nueva**, primer mensaje: `Hola quiero presentar una incidencia Hospital Nacional Hipólito Unanue - CODIGO-IPRESS 5946 Me cobraron sin recibo en la ventanilla.`; autorizar si lo pide, confirmar el lugar y elegir anónimo. | `Esto es lo que escribiste:` con el texto y **[Usar así]** **[Agregar más]**, apenas se elige anónimo. | Lo que se escribió junto al QR se ofrece como relato. «Agregar más» pide otro mensaje y lo une al anterior; «Usar así» sigue con la foto o el registro. | ☐ ☐ |
| 3.2 | `1` | `Ingresa tu número de documento.` **Sin** volver a mostrar el menú. | Atajo numérico, igual en los dos canales: `2` es Cita con referencia y `3` la incidencia. Sin IA. | ☐ ☐ |
| 3.3 | `1234567` (7 dígitos) | `Documento inválido. Debe tener 8 dígitos (DNI) o 9 dígitos (carnet de extranjería). Intenta de nuevo.` | Validación de formato, sin IA. Lo mismo con 10 dígitos o con letras. | ☐ ☐ |
| 3.4 | `12345678` | `Validando tu documento…` y `Te enviamos un código a tu teléfono o correo registrado. Escríbelo en el siguiente mensaje.` | Llamada a MINSA (fake) con `tipo_documento` `01`. | ☐ ☐ |
| 3.4b | Reiniciar, `1` y `123456789` (9 dígitos) | `Validando tu documento…` y `Te enviamos un código a tu teléfono o correo registrado. Escríbelo en el siguiente mensaje.` | Carnet de extranjería: llamada a MINSA (fake) con `tipo_documento` `03`; luego el código `1234` y las referencias se piden con tipo `03`. | ☐ ☐ |
| 3.5 | `0000` | `Código incorrecto. Te quedan 2 intento(s).` | Cuenta el intento. | ☐ ☐ |
| 3.5b | Reiniciar, llegar al paso del código y escribir `{ds`, luego `hola` y luego `???`. | `Código incorrecto. Te quedan 2 intento(s).`, `Código incorrecto. Te quedan 1 intento(s).` y `Superaste el número de intentos permitidos. Por favor, inicia el proceso nuevamente más tarde.` | Un mensaje con formato inválido (letras, símbolos, muy corto o muy largo, o un toque de botón) cuenta como intento fallido igual que un código incorrecto y **no** consulta a MINSA. Vale también para la consulta de incidencias y para la reverificación por inactividad. | ☐ ☐ |
| 3.6 | `1234` | `Verificando código…` y `Un momento, estamos analizando tu cuenta…`. En modo fake sin referencias, informa esa ausencia y continúa al distrito. Si el proveedor devuelve referencias, ofrece **Nueva cita** / **Cita con referencia**. | Guarda el token y consulta referencias antes del distrito, en web y WhatsApp. | ☐ ☐ |
| 3.7 | `asdfghjk` | `No reconocimos ese distrito. Por favor escribe el nombre de tu distrito o comuna:` | **Sin IA:** el filtro de basura lo corta antes de Gemini. Sigue en el mismo paso. | ☐ ☐ |
| 3.8 | `qwertyuiop` | El mismo mensaje. | Igual. | ☐ ☐ |
| 3.9 | `Lurigancjo` (error leve) | **Modo real:** `Buscando tu distrito: "Lurigancjo"…` y continúa (la IA lo corrige). **Modo fake:** `Buscando tu distrito: "Lurigancjo"…` y el botón **Cita Nivel Global** (el fake no corrige errores). | En modo real: **1 llamada a IA**. Aquí sí se llama a la IA (no es basura). | ☐ ☐ |
| 3.10 | Reiniciar y llegar al paso 3.6 de nuevo. Escribir `Lurigancho`. | `Buscando tu ubigeo…`, `Entendido. Buscando especialidades y citas disponibles en *Lurigancho*…` y la lista `Selecciona la especialidad:` (MEDICINA GENERAL, ODONTOLOGIA). | Resuelto **sin IA** con el padrón local. | ☐ ☐ |
| 3.11 | `odontología` (texto, sin tocar la lista) | `Buscando establecimientos…`, `Establecimiento encontrado: CENTRO DE SALUD LURIGANCHO. Buscando fechas disponibles…` y la lista `Selecciona la fecha:` con filas como `mar 22 sep` (no la fecha cruda que entrega MINSA o el catálogo fake). | Coincide el nombre con la fila ofrecida. Sin IA. La fila muestra día de semana + fecha con el mes en letras; lo que viaja a MINSA (`citaFecha`) no cambia. | ☐ ☐ |
| 3.12 | `1` | `Buscando horarios disponibles…` y la lista `Selecciona el horario:` (8:00 AM - 8:30 AM, 9:30 AM - 10:00 AM, 1:00 PM - 1:30 PM). | En listas, `1` es la posición 1. Las horas se muestran en formato 12 horas; hacia MINSA siguen viajando en 24 horas (`08:00`, `13:00`…), sin cambio. | ☐ ☐ |

> **Un solo horario:** si un día ofrece **un solo** horario, o la última página de «Ver más horarios» deja uno solo, el bot **pide confirmación** antes de agendar (caso 3.17). Con el catálogo fake, la **tercera fecha** de la lista tiene un único horario para probarlo.

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
| 3.15b | Tras 3.15a, escribir `si por favor` (o `1`, o tocar **Sí, enviar código**). | `Enviándote un nuevo código de verificación…` y `Te enviamos un código a tu teléfono o correo registrado. Escríbelo en el siguiente mensaje.` Tras el código (`1234` en fake) continúa en el paso donde estaba. | Reusa el DNI guardado, no lo pide de nuevo. Sin IA. | ☐ ☐ |
| 3.15c | Repetir 3.15a y responder `no, gracias` (o `2`, o **Cancelar**). | El menú `¿En qué podemos ayudarte hoy?`. | La sesión queda vacía, sin token ni DNI. | ☐ ☐ |
| 3.15d | En `¿Confirmas el horario …?` escribir `Si por favor` (también `dale`, `ok`, `de acuerdo`). | `Agendando tu cita…` y sigue como con el botón. Con `no, gracias`, `otro horario` o `ver mas` vuelve `Sin problema. Elige otro horario:`. | Reconocedor de sí/no sin IA. Con algo ambiguo (`si pero a las 3`) repite los botones sin agendar. | ☐ ☐ |
| 3.15e | Con la sesión ya iniciada (tras la bienvenida), escribir `Quiero una cita en San Juan de Lurigancho para poder atenderme en medicina general`. | `¡Entendido! Quieres agendar una cita médica. Antes de continuar necesito verificar tu identidad — ingresa tu número de documento.` **Sin** `Un momento, estamos revisando tu mensaje…`. | **Sin IA.** Mismos slots que 3.1c. | ☐ ☐ |
| 3.15f | Escribir `hdp` en el menú y, tras la advertencia, `ya dale` (también `continuar`, `vamos`, `sigue`). | El menú `¿En qué podemos ayudarte hoy?`, sin `Un momento…`. | Equivale a tocar **Continuar**. Solo vale justo después de la advertencia. | ☐ ☐ |
| 3.15f-bis | Primer mensaje con un distrito mal escrito y una preposición fuerte (`en`/`cerca`/`desde`), ej. `quiero cita de odontología cerca de Lurignacho`. Completar DNI y OTP. | Al verificar el OTP: `Buscando tu distrito: "quiero cita de odontología cerca de Lurignacho"…` (**no** pregunta liso «Cuéntanos en qué distrito buscas atención»). | El hint determinístico falla por el typo (`citaDistritoHintText` queda vacío), pero como hay una preposición de lugar se intenta `resolveDistritoText` con el mensaje completo antes de preguntar de nuevo — antes se preguntaba sin intentar nada. Con un mensaje que nunca nombra un lugar (`quiero una cita de odontología`) sigue preguntando liso, sin gastar IA. | ☐ ☐ |
| 3.15g | Solo con MINSA real: provocar que la reserva sea rechazada con un mensaje real de MINSA que mencione el cupo/horario (por ejemplo, un cupo tomado). | `No pudimos reservar ese horario, puede que otra persona lo haya tomado justo antes. Te muestro los horarios disponibles de la misma fecha:` y la lista de nuevo. A la tercera falla: el mensaje de MINSA o el genérico `No pudimos agendar tu cita. Intenta de nuevo más tarde.` | `status: "rejected"` con mensaje ambiguo o vacío. Log `minsa.book_appointment.failed` con `reason: "ambiguous_rejection"` (ver 4.4). | ☐ ☐ |
| 3.15g-ter | Solo con MINSA real: provocar que el endpoint de reserva responda 5xx (500, 502 o 503) sin un mensaje de cita duplicada, en web y WhatsApp. | `En este momento el servicio tiene problemas. Por favor, inténtalo más tarde.` La sesión se cierra: **no** vuelve a mostrar la lista de horarios ni ofrece reintentar. Escribir `Hola` vuelve al saludo. | `status: "unavailable"`. Log `minsa.book_appointment.failed` y `turn.note` `booking_rejected` con `reason: "service_unavailable"`. | ☐ ☐ |
| 3.15g-bis | Solo con MINSA real: provocar que el endpoint de reserva falle con un error HTTP crudo 4xx (que no sea 401), no un rechazo de negocio. | `Tuvimos un problema técnico al intentar reservar tu cita. Vamos a intentarlo de nuevo — estos son los horarios disponibles de la misma fecha:` — **nunca** «otra persona lo haya tomado» (sería inventar una razón que MINSA no dio). A la tercera falla: el genérico, también sin mencionar a otra persona. | `status: "error"`. Log con `reason: "http_error"`. Corrección de campo: antes ambos casos mostraban el mismo texto de «tomado por otra persona». | ☐ ☐ |
| 3.15g-ter | Solo con MINSA real: intentar agendar una cita cuando el ciudadano **ya tiene una cita activa** para ese mismo turno/servicio (caso real de campo: MINSA respondió HTTP 500 con `"El paciente ya tiene una cita activa en el mismo turno o servicio."`). | `Ya tienes una cita activa registrada para ese mismo turno o servicio.` `¿Deseas cambiar de fecha?` con los botones **[Sí, otra fecha]** y **[No, salir]** — **nunca** el texto crudo de MINSA («Error al generar la cita en el servicio externo:...»). | `status: "duplicate"` detectado **antes** de mirar el código HTTP (MINSA no siempre usa 2xx para esto). Estado `cita_awaiting_other_fecha`, misma mecánica que 3.17e/3.17l: se borra la fecha y hora que teníamos en memoria y se recuerda la fecha como descartada. **No** se loguea como error (es un resultado de negocio esperado, no una falla). | ☐ ☐ |
| 3.15h | Con el OTP verificado, escribir un distrito que MINSA devuelva junto a vecinos (solo con MINSA real, por ejemplo `San Juan de Lurigancho`). | `Entendido. Buscando especialidades y citas disponibles en *San Juan de Lurigancho*…` y luego la lista de especialidades. **Sin** `Selecciona tu ubigeo:`. | Si entre los resultados hay uno que es exactamente el distrito ya resuelto, se elige solo. Si la lista sí aparece y se responde con texto (`San Juan de Lurigancho`), el mismo mensaje `Entendido…` nombra el distrito. | ☐ ☐ |
| 3.15i | Solo con MINSA real: elegir un distrito sin especialidades disponibles. | `No encontramos especialidades disponibles en *{distrito}* en este momento.` `¿Deseas buscar en otro distrito cercano?` con `[1] Sí, buscar otro distrito` `[2] No, salir` y los botones **[Sí, otro distrito]** y **[No, salir]**. | Estado `cita_awaiting_other_distrito`: la conversación **no** se cierra. Un texto suelto (`quee ?`) repite la pregunta, sin bienvenida. | ☐ ☐ |
| 3.15j | Tras 3.15i, responder `sí` (o `dale`, `cambiar`, `1`, o tocar **Sí, otro distrito**). | `Perfecto. Cuéntanos en qué otro distrito buscas atención (ej. "Miraflores").` | Se olvida el distrito anterior (y el primer mensaje, para que no lo vuelva a usar); se conservan el DNI y la verificación. | ☐ ☐ |
| 3.15k | Tras 3.15i, responder `no` (o `salir`, `cancelar`, `2`, o tocar **No, salir**). | `Gracias por comunicarte con el *Ministerio de Salud del Perú*. Cuando quieras volver a intentarlo, escríbenos nuevamente. ¡Que tengas un buen día! 👋` | Sesión limpia (estado `cita_no_coverage_closed`). Escribir `Hola` después da la bienvenida. | ☐ ☐ |
| 3.15l | Tras 3.15i, responder de una sola vez `Si quiero en San Borja` (nombrando el distrito nuevo en el mismo mensaje). | `Buscando tu ubigeo…` y sigue directo al catálogo de ese distrito. **Sin** el mensaje intermedio «Perfecto. Cuéntanos en qué otro distrito buscas atención». | Se reconoce el distrito con el mismo padrón local del paso inicial (y, si no lo encuentra ahí, con la IA, en el mismo mensaje). Se olvida el distrito anterior igual que en 3.15j. Un nombre ambiguo (`prefiero Miraflores`) pregunta cuál, igual que en el paso inicial. `dale`, `cambiar`, `salir`, `cancelar` y `quee ?` se comportan exactamente igual que en 3.15j/3.15k/3.15i — no se confunden con un nombre de distrito. | ☐ ☐ |

### 3.16 Consultas fuera de alcance (sin IA)

Texto de cada respuesta: el del Excel de auditoría (hoja «Catálogo de Intenciones OutofSc»). Se pueden probar en el menú (Chat-bot o whatsapp-bot) y también como **primer mensaje** de una sesión nueva: la respuesta es la misma y sin bienvenida. **Sin IA**: no aparece «Un momento…».

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 3.16a | `Mi mamá no puede respirar` (también `dolor de pecho`, `creo que es un infarto`, `se está asfixiando`, `me muero`) | Un solo mensaje: `⚠️ ESTE CANAL NO ATIENDE EMERGENCIAS MÉDICAS` … `- SAMU: 106 (ambulancias y emergencias médicas)` `- Bomberos: 116 (rescate y urgencias)` … `Acuda ahora mismo al establecimiento de salud más cercano.` **Sin** invitar a continuar. | La conversación **termina**: estado `emergency_closed`, sesión vacía, sin token, nada pendiente. Log `turn.note` (**warn**) `out_of_scope` con `category: OOS-01`, `closed: true`. El siguiente mensaje empieza una conversación nueva (`Hola` da la bienvenida). | ☐ ☐ |
| 3.16b | `ustedes son unos idiotas, mi mamá no puede respirar`; y `quiero una cita, me duele el pecho` | El mismo mensaje de emergencia, **no** la advertencia institucional ni el inicio de la cita. | La emergencia se lee antes que el filtro léxico y antes que cualquier intención de cita o reclamo. | ☐ ☐ |
| 3.16c | `¿Mi SIS está activo?` | `Consulta sobre SIS (Seguro Integral de Salud):` … `app.sis.gob.pe/ConsultaWeb` … `941 988 565` … `escriba CITAS.` | `category: OOS-02` (nivel info). | ☐ ☐ |
| 3.16d | `¿Ya aceptaron mi referencia?` (también `quiero una cita por referencia`) | Un solo mensaje con botones: `Gestión de Referencias Médicas:` … `Para una cita en hospital o instituto, tu centro de origen debe emitir la Hoja de Referencia (REFCON).` … `¿Qué deseas hacer?` y los botones **Consultar referencia** / **Agendar cita**. | `OOS-03` (log `out_of_scope`, nivel info), estado `main_menu_referencia_choice`. `punto de referencia` (una dirección) **no** dispara esto. Un mensaje que no es un pedido corto de la referencia sigue aquí. | ☐ ☐ |
| 3.16d-b | `quiero consultar mi referencia`, `referencia` y `estado de mi referencia`. | **No** el mensaje de 3.16d: `Para consultar tu referencia debes iniciar sesión. Ingresa tu número de documento.` | El pedido corto entra al servicio Consultar referencia **antes** de fuera de alcance (ver 3.18a). Es el caso que chocaba con `OOS-03`. | ☐ ☐ |
| 3.16d-c | Tras 3.16d: tocar **Consultar referencia**; en otra prueba tocar **Agendar cita**; en otras escribir `1`, `2`, `CITAS`, `Agendar cita` y `zzzz`. | **Consultar referencia** y `1`: `Para consultar tu referencia debes iniciar sesión. Ingresa tu número de documento.` **Agendar cita**, `2`, `CITAS` y `Agendar cita`: `Ingresa tu número de documento.` (como CITAS en el menú). `zzzz`: `No pudimos identificar tu respuesta. Selecciona una de las opciones mostradas.` y los mismos botones. | Los números siguen el orden de los botones (`1` referencia, `2` cita), no el del menú. Un toque en los botones de una elección anterior se ignora (log `inbound.stale_tap`). | ☐ ☐ |
| 3.16e | `¿Ya salieron mis análisis de sangre?` | `Entrega de Resultados Médicos:` … `Ley N° 26842` … `de forma presencial`. | `OOS-04`. | ☐ ☐ |
| 3.16f | `¿Tienen Paracetamol o Insulina en la posta?` | `Consulta de Medicamentos:` … `observatorio.digemid.minsa.gob.pe` … `escriba INCIDENCIA`. | `OOS-05`. `medicina general` (una especialidad) **no** dispara esto. | ☐ ☐ |
| 3.16g | `¿Qué días vacunan contra la influenza?` | `Vacunación y Carnets Oficiales:` … `carnetvacunacion.minsa.gob.pe` … `Línea 113 (Opción 1)`. | `OOS-06`. | ☐ ☐ |
| 3.16h | `Quiero hablar con un doctor ahorita` | `Orientación Médica Telefónica Gratuita:` … `Infosalud: Línea 113`. | `OOS-07`. | ☐ ☐ |
| 3.16i | `Mi reclamo N° 458-2026 sigue sin resolverse` | `Seguimiento de Reclamos:` … `SUSALUD al 113 (Opción 7)` … `escriba INCIDENCIA`. | `OOS-08`. Pedir el **estado** de un reclamo ya presentado no abre un reclamo nuevo. | ☐ ☐ |
| 3.16j | `Necesito que me sellen mi descanso médico para mi trabajo` | `Trámites Documentarios y Certificados:` … `SISFOH` … `Unidad Local de Empadronamiento (ULE)`. | `OOS-09`. | ☐ ☐ |
| 3.16k | Tras cualquiera de las anteriores, escribir `CITAS`; en otra prueba `CONTINUAR`; en otra `RECLAMO`. | `CITAS`: `Ingresa tu número de documento.` `CONTINUAR`: el menú `¿En qué podemos ayudarte hoy?`. `RECLAMO`: `¿En qué establecimiento de salud ocurrió? Escribe su nombre o su código IPRESS.` con los dos botones. | Las tres palabras que piden los mensajes se entienden **sin IA**. Solo la palabra sola: `quiero una cita` sigue su camino de antes. Tras 3.16d solo valen las respuestas de 3.16d-c: `CONTINUAR` y `RECLAMO` repiten los botones. | ☐ ☐ |
| 3.16l | Con la sesión ya iniciada, en el paso del DNI escribir `vacunas`; en el paso de la descripción de la incidencia escribir `no me entregaron mis medicamentos`. | DNI: `Documento inválido. Debe tener 8 dígitos (DNI) o 9 dígitos (carnet de extranjería). Intenta de nuevo.` Reclamo: se toma como la descripción y sigue el flujo. | Dentro de un flujo solo se aplica la lectura de urgencias (3.16o): las demás categorías nunca, cada paso lee lo que pidió. | ☐ ☐ |
| 3.16m | `quiero una cita de medicina general` y `necesito cita en medicina interna` | Siguen el camino de la cita (DNI o consulta a la IA), **sin** mensaje de medicamentos. | Contraejemplos de falsos positivos de OOS-05. | ☐ ☐ |
| 3.16n | Tras terminar un flujo (por ejemplo tras 3.14a), escribir `¿Tienen vacunas para mi bebé?` | El mensaje de OOS-06, **sin** bienvenida. | El reingreso tras un estado terminal se lee igual que un primer mensaje. | ☐ ☐ |
| 3.16o | En el paso del DNI (o del OTP, del distrito, de la descripción de la incidencia, de la confirmación del horario) escribir `mi hijo no respira`. | El mismo mensaje de emergencia de 3.16a, **y nada más**: el flujo **se cierra**. | Sesión `emergency_closed` vacía: se pierde la verificación y lo elegido, a propósito (el bot no mantiene abierta una conversación con una urgencia). Solo textos de hasta 120 caracteres. Con la sesión expirada o esperando la nueva verificación también se corta. | ☐ ☐ |
| 3.16p | En el paso de la descripción de la incidencia pegar un relato largo (más de 120 caracteres) que mencione `una ambulancia que nunca llegó`. | Se toma como la descripción y sigue `¿Deseas adjuntar una foto como evidencia?…`, **sin** el mensaje de emergencia. | Un relato de un hecho pasado es evidencia, no una alarma. | ☐ ☐ |

### 3.17 Un solo horario disponible (confirmación antes de agendar)

Chat-bot con el catálogo fake: en la lista de fechas elige la **tercera** fila (`mié 24 sep` o el día que corresponda; tiene un único horario, 1:00 PM - 1:30 PM). Con MINSA real sirve cualquier día con un solo horario, o una última página con uno solo.

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 3.17a | Elegir la tercera fecha. | `Solo hay un horario disponible: 1:00 PM - 1:30 PM. ¿Lo confirmas?` con **[Sí, confirmar]** y **[No, gracias]**. **No** aparece `Agendando tu cita…`. | Estado `cita_awaiting_hora_confirm`. No se consulta `book_appointment` hasta que el ciudadano confirma. | ☐ ☐ |
| 3.17b | Tocar **Sí, confirmar**. | `Agendando tu cita…`, la constancia y el cierre (ver 3.14a). | Se agenda una sola vez. | ☐ ☐ |
| 3.17c | Repetir 3.17a y escribir `esa hora` (también `me sirve`, `me conviene`, `esa misma`, `la tomo`, `13:00`, `a la 1`, `sí`). | Igual que 3.17b: agenda. | Se entiende que toma **ese** horario, escrito o con palabras. Sin IA. | ☐ ☐ |
| 3.17d | Repetir 3.17a y escribir `a las 3`, `13:30`, `si pero a las 3` o `no a la 1`. | Repite `Solo hay un horario disponible: 1:00 PM - 1:30 PM. ¿Lo confirmas?` con los botones. **No agenda.** | Una hora distinta, o cualquier negación, nunca agenda. Log `turn.note` (warn) `confirmation_unknown`. | ☐ ☐ |
| 3.17e | Repetir 3.17a y tocar **No, gracias** (o escribir `no`, `otro horario`). | `Entendido, ese horario no te conviene. Como era el único horario disponible para esa fecha, te recomiendo elegir otra fecha.` `¿Deseas cambiar de fecha?` con `[1] Sí, cambiar de fecha` `[2] No, salir` y los botones **[Sí, otra fecha]** y **[No, salir]**. | Estado `cita_awaiting_other_fecha`. La sesión **no** se cierra: se conservan el token, el DNI, el establecimiento y la especialidad. La fecha rechazada se recuerda como descartada. Log `turn.note` `hora_declined`. | ☐ ☐ |
| 3.17f | Tras 3.17e, tocar **Sí, otra fecha** (o `sí`, `1`, `otra fecha`, `cambiar`, `otro día`). | `Buscando otras fechas disponibles…` y la lista de fechas **sin la fecha descartada** (con el catálogo fake quedan las dos primeras). Sin pedir DNI ni OTP otra vez. | Vuelve a consultar las fechas. Si queda una sola, se toma sola y sigue a sus horarios. | ☐ ☐ |
| 3.17g | Tras 3.17e, tocar **No, salir** (o `no`, `2`, `salir`). | `Entendido, no buscaremos otra fecha por ahora. Gracias por comunicarte con el *Ministerio de Salud del Perú*. Cuando quieras volver a intentarlo, escríbenos nuevamente. ¡Que tengas un buen día! 👋` **Sin** pedir que escriba CITAS. | Estado `cita_declined_closed`, sesión vacía sin token. Escribir `Hola` después da la bienvenida. Log `cita_closed` con `reason: declined`. Texto neutral a propósito: `offerOtherFecha` se dispara por 3 motivos distintos (horario único rechazado, sin horarios, o cita duplicada) y una disculpa específica de uno sería falsa para los otros dos. | ☐ ☐ |
| 3.17h | Con MINSA real y un establecimiento con **una sola** fecha: repetir 3.17a y 3.17f. | `Lamentamos informarte que por ahora no hay otras fechas disponibles en este establecimiento.` y la despedida. | Como la fecha rechazada no se vuelve a ofrecer, no hay bucle. Log `cita_closed` con `reason: no_other_dates`. | ☐ ☐ |
| 3.17i | En 3.17f elegir otra fecha que **también** tenga un solo horario y decir que no; pedir cambiar de fecha otra vez. | La lista deja fuera **las dos** fechas rechazadas; si no queda ninguna, la disculpa de 3.17h. | Las fechas descartadas se acumulan. | ☐ ☐ |
| 3.17j | Con MINSA real y un día de 11 horarios: pedir `Ver más horarios` hasta la última página (un solo horario) y tocar **No, gracias**. | `Sin problema. Elige otro horario:` y la lista de la página **anterior**. | Vuelve a la página anterior; `Ver más horarios` sigue funcionando y no queda vacío. | ☐ ☐ |
| 3.17k | En una confirmación normal (`¿Confirmas el horario 8:00 AM - 8:30 AM?`, tras escribir `8`) escribir `esa hora` o `a las 8`. | Agenda. Con `a las 9` repite la pregunta sin agendar. | Vale para cualquier confirmación de horario, no solo la del horario único. | ☐ ☐ |
| 3.17l | Solo con MINSA real: elegir una fecha cuya lista de horarios venga vacía (`list_horas` sin filas, aunque la lista de fechas haya mostrado cupos). | `No hay horarios disponibles para esa fecha.` `¿Deseas cambiar de fecha?` con `[1] Sí, cambiar de fecha` `[2] No, salir` y los botones **[Sí, otra fecha]** y **[No, salir]**. **No** es un cierre de sesión. | Estado `cita_awaiting_other_fecha` (antes: `cita_booking_rejected`, sin salida — bug real de campo, corregido). La fecha se recuerda como descartada. Log `turn.note` `hora_declined` con `reason: "no_horarios"`. No reproducible en el catálogo fake (siempre tiene horarios). | ☐ ☐ |

### 3.18 Cita con referencia (ver [flujo-referencias.md](../flujo-referencias.md))

Servicio propio, sin bandera. Las referencias reales vienen de MINSA (`SANDBOX_USE_REAL_MINSA=true` y el endpoint `/whatsapp/api/v1/references`); en modo fake siempre hay «sin referencias». Los casos con referencias se prueban con MINSA real o con los DNI de demostración `10308523` y `47391441` (piloto comercial), que además exigen que MINSA valide el documento. La fila **Cita con referencia** está en el menú de los dos canales.

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 3.18a | En el menú tocar **Cita con referencia** (o escribir `2`), o escribir `referencia`, `cita con referencia` o `quiero consultar mi referencia`. Vale en whatsapp-bot y en el Chat-bot. | `Para agendar una cita con referencia debes iniciar sesión. Ingresa tu número de documento.` Sin términos y condiciones, aunque `TERMINOS_ENABLED=true`. | Estado `cita_awaiting_dni` con el dato `postLoginFlow` = `referencias` (panel Debug). Sin IA. | ☐ ☐ |
| 3.18b | Tras 3.18a, escribir `12345678` y luego `1234` (modo fake). | `Validando tu documento…`, el aviso del código, `Verificando código…` y `Un momento, estamos analizando tu cuenta…`. **No** pregunta el distrito. | Mismos pasos de identidad que la cita (3.4 y 3.6). Estado `referencia_lookup_pending` y consulta `list_references` con tipo `01`. | ☐ ☐ |
| 3.18c | **Con referencias** (MINSA real con un documento que las tenga, o un DNI demo): terminar el OTP. | Lista `Estas son tus referencias:`. Web: tarjetas de 3.19b. WhatsApp real: especialidad primero, título de hasta 24 caracteres y descripción de hasta 72. Las demos conservan su listado. | Estado `cita_awaiting_referencia_select`; web pagina 10 opciones y WhatsApp 7. | ☐ ☐ |
| 3.18d | Elegir una referencia real en web y WhatsApp; repetir con una demo. | Ambos canales reales consultan fechas directamente, sin `¿Es esta tu referencia?`. Se ofrece **Cambiar referencia** y se exige confirmar el resumen final antes de reservar. | La reserva mantiene `referencia_id`; las demos conservan su detalle y confirmación propios. | ☐ ☐ |
| 3.18e | **Sin referencias** (un documento sin referencias en MINSA real): terminar el OTP. | `No cuentas con referencias registradas.` y `¿Deseas agendar una cita?` con **[Sí]** y **[No]**. | Estado `referencia_awaiting_cita_offer`. Solo para `empty`. | ☐ ☐ |
| 3.18e2 | **Consulta fallida** (modo fake con `12345678`, o MINSA real respondiendo 5xx o un cuerpo que no es un arreglo): terminar el OTP. | `No pudimos consultar tus referencias en este momento. Inténtalo de nuevo más tarde.` y `¿Deseas agendar una cita?` con **[Sí]** y **[No]**. | Estado `referencia_awaiting_cita_offer`. Vale para `error`, `unavailable` y cualquier otro estado; nunca dice que no hay referencias. | ☐ ☐ |
| 3.18e3 | **Token rechazado** (MINSA real respondiendo 401 a la consulta de referencias). | `Tu verificación anterior expiró por inactividad…` y se vuelve a pedir el documento; tras el OTP se consulta de nuevo. | Estado `cita_awaiting_dni`; sin token guardado. | ☐ ☐ |
| 3.18f | Tras 3.18e, tocar **Sí** (o escribir `sí`). | `¡Verificado! Cuéntanos en qué distrito buscas atención (ej. "Miraflores").` **Sin** pedir documento ni código otra vez. Con `TERMINOS_ENABLED=true`, antes los términos (3.20). | Estado `cita_awaiting_distrito_ai` con el token y el DNI ya guardados. Sigue como la cita desde 3.7. | ☐ ☐ |
| 3.18g | Repetir hasta 3.18e y tocar **No** (o escribir `no`). | `Entendido. Cuando necesites agendar una cita, con o sin referencia, escríbenos. ¡Que tengas un buen día!` | Estado terminal `referencia_closed`, sesión vacía sin token. Escribir `Hola` después da la bienvenida. | ☐ ☐ |
| 3.18h | Repetir hasta 3.18e y escribir `mmm no se`. | `No pudimos identificar tu respuesta. Selecciona una de las opciones mostradas.` y otra vez `¿Deseas agendar una cita?` con los botones. | No avanza. | ☐ ☐ |
| 3.18i | **Token vencido o inactividad:** en 3.18e (o en la lista de 3.18c) esperar más de 10 minutos y escribir cualquier cosa. | La alerta de sesión expirada de 3.15a con **[Sí, enviar código]** y **[Cancelar]**. Con **Sí**: nuevo código, `Verificando código…` y otra vez la consulta de referencias (3.18c o 3.18e). | Estado `cita_awaiting_reauth`; se borra el token y se conservan el DNI y `postLoginFlow`. El mensaje que llegó no se procesa. Pasa igual si el token del MINSA vence en menos de 30 s. Con **Cancelar**: lo mismo que en 3.15c. | ☐ ☐ |
| 3.18j | **Cita médica en ambos canales:** `1` (o `quiero una cita`), documento y OTP. | Pide el distrito. **No** consulta referencias. | Sin `list_references`. Para agendar con una referencia se entra por **Cita con referencia** (3.18a). Los DNI demo no activan referencias ficticias al entrar por Agendar. | ☐ ☐ |
| 3.18k | **whatsapp-bot y Chat-bot:** con incidencias encendidas, escribir `2`, `3` y `4` en el menú. | `2` pide iniciar sesión para la referencia, `3` abre el registro de una incidencia y `4` la consulta de una incidencia. Con incidencias apagadas, `3` y `4` responden `Por ahora solo puedo ayudarte a agendar una cita médica o una cita con referencia.` y el menú. | Los dos canales tienen la misma lista y la misma numeración. | ☐ ☐ |
| 3.18l | Solo con IA real (`SANDBOX_USE_REAL_AI=true`): en el menú escribir `quiero ver mi refrencia del hospital`; en otra prueba, `me derivaron al hospital y quiero que me atiendan allá`. | El primero: `Un momento, estamos revisando tu mensaje…` y luego `Para agendar una cita con referencia debes iniciar sesión. Ingresa tu número de documento.`. El segundo: el inicio de la cita (pide el documento), **no** la referencia. | Intención `referencia` de la IA (log `turn.note` `referencia_ai`). Un pedido de cita, aunque mencione la referencia o la derivación, sigue siendo `cita`. Un mensaje con la palabra exacta «referencia» que no es un pedido corto no llega a la IA: recibe la elección de OOS-03 (3.16d). | ☐ ☐ |

---

### 3.19 Cita con referencia en web y WhatsApp: elegir, agendar y cambiar

Estos casos corresponden al Chat-bot web y WhatsApp. Los estados y respuestas se comprueban en la interfaz o en pruebas del webhook con datos sintéticos; no se comparten tokens, cookies, documentos ni datos de ciudadanos. Para variar respuestas se utiliza transporte HTTP simulado fuera de producción. El modo fake normal devuelve `empty`; no se agregan documentos mágicos. Las demos mantienen sus pasos anteriores.

| Caso | Preparación y acción | Resultado esperado |
|---|---|---|
| 3.19a | Entrar por **Cita con referencia**, validar documento y OTP; MINSA devuelve referencias. | Aparece el listado de las referencias que permiten agendar, con **Cita sin referencia** y **Salir**. |
| 3.19b | MINSA devuelve referencias de distintas especialidades y estados 3, 5 y 7. | Se mantienen todas las referencias recibidas. Web: tarjetas con especialidad y seis campos completos. WhatsApp: especialidad primero, título ≤24 y descripción ≤72; listas de 7 opciones más controles de página. |
| 3.19c | Seleccionar una referencia real en web y WhatsApp. | Consulta fechas directamente, sin `¿Es esta tu referencia?` ni Sí/No intermedios. Usa IPRESS/UPS exactos y conserva su identificador, sin preguntar distrito ni reutilizar preferencias incompatibles. No crea una reserva. |
| 3.19d | Tocar un horario de la referencia o elegirlo mediante texto. | Aparece el resumen de referencia, especialidad, establecimiento, fecha y horario. No se llama a reservar hasta confirmar. |
| 3.19e | Confirmar el resumen. | La reserva envía el destino, especialidad, fecha y hora elegidos junto con el identificador de esa referencia. Se entrega la constancia. |
| 3.19f | Elegir **Cita sin referencia** en el listado. | Continúa el recorrido normal sin repetir documento u OTP, sin conservar un identificador de referencia para la reserva. Con `TERMINOS_ENABLED=true`, antes los términos (3.20). |
| 3.19g | MINSA responde con el arreglo vacío `[]`. | El adaptador obtiene `empty`; `No cuentas con referencias registradas.` y `¿Deseas agendar una cita?` (3.18e). |
| 3.19h | La consulta falla o devuelve una respuesta incompatible o una colección no vacía sin filas válidas. | El adaptador obtiene `error`; por ahora responde igual que 3.19g. |
| 3.19i | Elegir una referencia sin códigos de destino o especialidad, o una referencia que desapareció del listado. | Explica el problema y vuelve al listado (o lo vuelve a consultar con la identidad vigente); no inventa otro destino ni convierte silenciosamente la operación en cita normal. |
| 3.19j | MINSA rechaza la reserva porque ya existe una cita de esa especialidad. | `MINSA informa que ya tienes una cita activa para esta especialidad. Continuemos con una cita sin referencia.` y sigue la cita médica (pide el distrito, con los términos antes si la bandera está encendida), sin reutilizar el destino de la referencia. |
| 3.19k | Vence la sesión en el listado o la selección de referencia. | Pide verificar de nuevo y recupera el recorrido correspondiente. Si ya se elegían fechas u horarios, recupera ese paso. |
| 3.19l | Usar un botón anterior o enviar dos veces la confirmación, en web y WhatsApp. | El control de interacción rechaza el botón antiguo y no crea una segunda reserva. La firma y deduplicación del webhook siguen vigentes. |
| 3.19n | Consultar referencias después del OTP, reintentar un fallo y repetir después de verificar una sesión vencida. | La petición del servidor a MINSA incluye `Authorization: Bearer` con el token vigente; tras verificar de nuevo usa el token renovado. El cuerpo conserva sólo número y tipo de documento. Se comprueba con tokens sintéticos en el proveedor de prueba, sin imprimir ni copiar tokens reales. |
| 3.19o | El proveedor devuelve directamente un arreglo con varias referencias del mismo hospital, identificadores opacos, estados como cadenas y una descripción UPS vacía. Repetir con `[]` y con un arreglo sin filas válidas. | Las referencias válidas aparecen en la elección y el listado, sin exigir `status_reference`. Se conservan números y códigos originales. `[]` y una colección inválida ofrecen agendar una cita. La prueba HTTP usa el adaptador real y simula únicamente la comunicación externa. |
| 3.19p | Revisar tarjetas a 320, 375 y 1440 píxeles, con nombres largos y especialidad vacía; buscar por datos que no caben en la fila antigua, paginar y elegir con Enter. | La especialidad o atención aparece primero. Los seis campos permanecen completos, sin desbordamiento horizontal; el chat queda dentro de la ventana. La búsqueda encuentra los metadatos completos. La selección conserva el ID y muestra la especialidad y el número en el mensaje elegido. Las tarjetas anteriores quedan deshabilitadas. |
| 3.19q | Pulsar o escribir Cambiar referencia desde fechas, horarios, elección de otra fecha y resumen final. Elegir después otra referencia. | Vuelve al listado sin repetir identidad vigente. Retira selección, IPRESS/UPS, fecha, horarios, descartes y contadores anteriores. La nueva elección consulta los códigos exactos de la otra referencia; no reserva automáticamente. |
| 3.19r | Paginar fechas u horarios y usar Cambiar referencia con ratón y teclado. Elegir también una opción de la lista actual y probar después un botón antiguo. | Lista, navegación y cambio pertenecen a una única interacción activa. Las filas siguen disponibles junto con sus acciones; la paginación funciona y los mensajes anteriores quedan deshabilitados. |
| 3.19s | Con la sesión vencida, pulsar Cambiar referencia y completar una nueva verificación OTP. | Primero solicita verificar la identidad, sin consultar con el token vencido. Conserva la intención de cambiar y después del OTP actualiza las referencias y recupera su listado, en vez de volver a la disponibilidad anterior. |
| 3.19t | Simular fechas con cupos cero o negativos y horarios sin cupos positivos; repetir con una colección vacía. | En ambos canales sólo se ofrecen cupos mayores que cero. Sin fechas, pregunta «No encontramos cupos disponibles para esta referencia. ¿Deseas seleccionar otra referencia?» con **Sí** y **No, salir**, sin mostrar el listado ni consultar otra disponibilidad. Sin horarios de un día, permite otra fecha o Cambiar referencia. |
| 3.19t-bis | Ante la pregunta anterior, pulsar **Sí** o escribir `sí`/`1`. | Recupera sus referencias con la identidad vigente. La nueva selección limpia los datos anteriores y consulta el IPRESS/UPS exacto de la referencia elegida. Si la sesión venció, verifica otro OTP antes de recuperar las referencias. |
| 3.19t-ter | Ante la pregunta anterior, pulsar **No, salir** o escribir `no`/`2`. Repetir con sesión vencida. | Envía la despedida existente de referencias y cierra en `referencia_closed`, sin token, datos de cita ni contadores. No exige otro OTP para cerrar. Un saludo posterior inicia una conversación nueva. |
| 3.19t-quater | Ante la pregunta anterior, responder un texto que no es sí/no o pulsar un botón ajeno. | Repite la pregunta sin elegir una referencia, consultar disponibilidad ni reservar. |
| 3.19t-quinquies | Tras 3.19t-bis, revisar el listado. | La referencia sin cupos ya no aparece, en los dos canales. |
| 3.19u | Simular un error técnico al consultar fechas u horarios de una referencia. | Muestra un aviso de error, distinto de la falta de cupos, y recupera el listado para poder continuar. Una respuesta 401 conserva la reverificación del flujo; no se inventa disponibilidad. |
| 3.19v | Elegir entre referencias del mismo hospital con UPS diferentes y después cambiar de referencia. | Cada consulta usa el IPRESS/UPS original de la referencia elegida, incluso con descripciones similares o vacías. Resumen y reserva corresponden a ese identificador. |
| 3.19w | En WhatsApp, recorrer todas las páginas de 21 referencias, fechas y horarios y cambiar referencia desde fechas/horarios/resumen. | Referencias en grupos de 6 con **Cita sin referencia** y **Salir**; fechas y horarios en grupos de 7; página/cambio en la misma lista Graph; ≤10 filas totales y ninguna opción perdida. Confirmación final con ≤3 botones. |
| 3.19x | Usar firma inválida y token vencido al confirmar; duplicar un mensaje firmado y una selección antigua. | Rechaza la firma antes de la FSM, exige OTP antes de reservar con token vencido y no duplica ni acepta opciones de mensajes anteriores. MINSA y Graph simulados, sin reservas reales. |
| 3.19y | Hacer que Graph rechace una interacción con HTTP 400; escribir el título de página o Cambiar referencia que aparece en el texto de respaldo. | Conserva opciones, navegación y cambio. Los controles se muestran sin numerarlos como horarios/fechas seleccionables; escribir su título continúa por el paso correcto. Un error distinto de 400 no dispara este respaldo. |

#### Validación de la elección cuando faltan cupos: 21 de octubre de 2026

| Comprobación | Resultado y alcance |
|---|---|
| Suite completa Vitest | **3.467 aprobadas, ninguna fallida y 13 omitidas** por la configuración existente; 3.480 en total, en 779 suites. |
| Integración HTTP web y WhatsApp | **42/42 aprobadas**: 18 web y 24 WhatsApp. Fechas vacías o con cupos no positivos preguntan antes de mostrar referencias. Sí conserva la identidad y consulta el destino de la nueva selección; No usa la despedida existente, elimina credenciales y datos de cita y conserva sólo el control de interacción consumida. Los botones antiguos no reabren la conversación y un saludo permite empezar otra. MINSA y Meta simulados. |
| Vencimiento de sesión | La opción **No** cierra sin solicitar OTP. **Sí** vencido reautentica antes de recuperar referencias frescas. Una respuesta desconocida vencida reautentica y retoma la pregunta, sin listar ni consultar disponibilidad hasta recibir Sí. |
| Tipos, lint y formato | `npx tsc --noEmit` y `npm run format:check` completos aprobados; ESLint, incluido `import/no-cycle`, aprobado en los archivos cambiados. |
| Rendimiento separado | **17/17 aprobadas**, ejecutadas fuera de las otras comprobaciones. P99 de la guarda léxica: 258,2 µs sobre 10.000 mensajes, por debajo del límite de 2 ms. |
| Alcance local | Se modificó el proyecto Node. Python, `.env`, esquemas y migraciones permanecen fuera de esta entrega; sin commits, publicaciones, mensajes Meta ni reservas reales. El demo local en memoria sigue operativo. |

#### Validación anterior de la extensión a WhatsApp: 21 de octubre de 2026

| Comprobación | Resultado y alcance |
|---|---|
| Suite completa Vitest | **3.405 aprobadas, ninguna fallida y 13 omitidas** por la configuración existente; 3.418 en total, en 773 suites. |
| Webhook de referencias | **15 pruebas nativas aprobadas**, incluidas las negativas y el caso Graph HTTP 400. `tests/security/whatsapp-reference-contract.test.ts` recorre webhook firmado, FSM y adaptadores reales con MINSA y Graph simulados: modalidad tras OTP, cambio desde fechas/horarios/resumen, bearer/códigos exactos, página completa de 21 opciones y confirmación final. Son parte de la suite global, no se suman otra vez. |
| Respaldo de Graph | Pruebas aprobadas: HTTP 400 conserva página y cambio en texto sin numerarlos como opciones reservables; escribir sus títulos permite continuar. Otros errores no activan ese respaldo. |
| Tipos, lint y formato | `npx tsc --noEmit`, `npm run lint` y `npm run format:check` completos aprobados, además del foco de los archivos finales de respaldo. |
| Rendimiento separado | **17/17 aprobadas**, ejecutadas fuera de la suite principal. P99: 392,9 µs en 10.000 mensajes, por debajo del límite de 2 ms. |
| Seguridad y límites | Se conservan firma, deduplicación, candado y control de interacción por mensaje. Listas Graph con 7 opciones más controles, ≤10 filas; título ≤24, descripción ≤72, resumen ≤3 botones. |
| Alcance externo | No se enviaron mensajes a Meta ni consultas/reservas reales a MINSA. Sin modificaciones de `.env`, SQL o migraciones; sin commits ni publicaciones. El demo y los servicios existentes se conservan. |

La validación usa datos sintéticos y transporte HTTP simulado. No acredita cupos disponibles ni aceptación de los mensajes en una cuenta Meta real. Las tarjetas web mantienen el diseño anterior ya validado; esta extensión adapta la misma funcionalidad al transporte WhatsApp.

#### Validación local anterior del chat web: 21 de octubre de 2026

| Comprobación | Resultado |
|---|---|
| Suite completa de Vitest | 3321 pruebas aprobadas, ninguna fallida y 13 omitidas por la configuración existente; 3334 en total. |
| TypeScript | `npx tsc --noEmit` aprobado. |
| Integración HTTP de esta funcionalidad | Aprobada con comunicación externa simulada: selección directa, Cambio de referencia en fechas, horarios y resumen, paginación, interacción vigente, códigos de otro destino y nueva verificación. Las lecturas de sesión descartan el canal como el repositorio PostgreSQL. |
| Adaptador y autenticación de referencias | Se verifican arreglo raíz, identificadores opacos, ceros iniciales, UPS sin descripción, estados sin filtrar, Bearer exacto y cuerpo sin token. Las pruebas de frontera recorren ruta, ejecutor y adaptadores reales con HTTP externo simulado; no sustituyen el adaptador de referencias. |
| Navegador de esta entrega | Chrome automatizado en 375 y 1440 píxeles, con la API del chat interceptada mediante respuestas sintéticas. Aprobados referencia → fechas → horarios → resumen, Cambiar referencia en los tres pasos con teclado, opciones anteriores deshabilitadas y lista con su acción activas simultáneamente. Sin desbordamiento horizontal, panel dentro de la ventana, sin errores JavaScript ni reservas reales. |
| Tarjetas y búsqueda automática | Aprobadas dentro de la suite: campos completos, identificadores y metadatos, entrada inmutable, botones deshabilitados y escape de HTML remoto. La revisión anterior de tarjetas también cubrió 320 píxeles. |
| Rendimiento | 17 pruebas aprobadas, ejecutadas por separado de la suite principal. |
| Formato | Comprobación completa de Prettier aprobada. |
| ESLint | `npm run lint` completo aprobado. |
| Demo con la configuración local del usuario | `/sandbox` respondió 200 y `/api/health` respondió 200 con `status: ok`. El proceso existente continúa ejecutándose y recibió los cambios en desarrollo. |

Estas comprobaciones utilizan datos sintéticos, HTTP externo simulado o respuestas de la API interceptadas en el navegador. No se enviaron reservas a MINSA ni mensajes a Meta. La comprobación PostgreSQL se limitó a conexión y lectura de metadatos; no se ejecutaron migraciones ni pruebas de carga contra la base real. La validación del usuario contra MINSA real sigue pendiente: no se han confirmado cupos reales ni una reserva real con este recorrido final.

#### Revisión de la interfaz de tarjetas

Alcance de la revisión anterior: tarjetas de referencias web, metadatos, selector y búsqueda, con datos sintéticos. En la extensión posterior también se adapta WhatsApp a especialidad primero y límites Graph. Para ver el formato actualizado en una conversación antigua se debe volver a consultar: el historial conserva la respuesta recibida previamente.

| Filtro | Veredicto | Evidencia |
|---|---|---|
| FE-01: estructura | PASA | Componentes separados para tarjeta, campos y selector; contrato tipado; utilidad de búsqueda con pruebas; convenciones de UI y regex aprobadas. |
| FE-02: estilos | PASA | Botón, insignia e íconos existentes, tokens de Tailwind sin valores arbitrarios; nombres completos con salto de línea y revisión en navegador. |
| FE-03: datos | PASA | Metadatos producidos por el servidor sin documento, token ni códigos; ninguna petición ni almacenamiento nuevo en la interfaz. |
| FE-04: formato | PASA | Sin comentarios ni datos de prueba en producción; formato de los archivos modificados aprobado. |
| FE-05: entrega | PASA local | Se conserva la rama del usuario; sin commits ni publicaciones, conforme a su instrucción. |

### 3.20 Términos y condiciones antes de agendar (con `TERMINOS_ENABLED=true`)

Encender `TERMINOS_ENABLED=true` y reiniciar el proceso. Para el enlace de whatsapp-bot, definir `TERMINOS_URL` (por ejemplo `https://<host-del-bot>/terminos`). El contenido de los términos está vacío por ahora.

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 3.20a | **Chat-bot:** en el menú tocar **Agendar una cita médica** (o escribir `1`, `cita`, o `quiero cita de pediatría en San Borja`). | Se abre una ventana «Términos y condiciones» con el contenido (vacío, con desplazamiento), la casilla «Acepto los términos y condiciones», **Continuar** deshabilitado y **No acepto**. | Estado `cita_awaiting_terminos`; dato `terminosResume` = `ask_documento` (panel Debug). | ☐ ☐ |
| 3.20b | Tras 3.20a, marcar la casilla y tocar **Continuar**. | El mensaje de entrada de siempre (`Ingresa tu número de documento.` o el que corresponda al pedido) y la tarjeta del documento. | Dato `terminosAceptados` = `true`. Se guarda una fila en `chatbot.aceptacion_terminos` con canal web y versión `2026-10-29` (con base de datos). Las pistas del pedido se conservan. | ☐ ☐ |
| 3.20c | **whatsapp-bot:** escribir `cita`. | Un mensaje «Términos y condiciones» con el botón **Ver términos** (abre `TERMINOS_URL`) y otro con la pregunta, la frase «Por WhatsApp solo recibimos tu número y los mensajes que nos envías para atenderte. Meta no comparte con el MINSA tu dirección IP.» y los botones **Acepto** y **No acepto**. Sin `TERMINOS_URL`, solo el segundo. | Sin `TERMINOS_URL` queda el aviso `terminos.url_missing` en el log. | ☐ ☐ |
| 3.20d | Tras 3.20c, tocar **Acepto** (o escribir `acepto` o `sí, acepto`). | `Para comenzar, por favor indícanos tu número de documento:` (el texto de entrada del primer mensaje). | Fila en `chatbot.aceptacion_terminos` con canal WhatsApp. | ☐ ☐ |
| 3.20e | En cualquiera de los dos canales, ante los términos tocar **No acepto** (o escribir `no acepto`). | `Lo sentimos. Muchas gracias por usar nuestros servicios.` y la despedida. | Estado terminal `cita_terminos_declined`, sesión vacía. El siguiente mensaje empieza de nuevo. | ☐ ☐ |
| 3.20f | Ante los términos escribir `hola`. | `No pudimos identificar tu respuesta…` y los términos otra vez. | No avanza. | ☐ ☐ |
| 3.20g | Aceptar, terminar o abandonar la cita sin cerrar la sesión y volver a pedir una cita. | No se vuelven a mostrar los términos en la misma sesión. | Dato `terminosAceptados` conservado. | ☐ ☐ |
| 3.20h | Entrar por **Cita con referencia**, completar documento y OTP con referencias y tocar **Cita sin referencia**. | Primero los términos; al aceptarlos, `¡Verificado! Cuéntanos en qué distrito…` sin volver a pedir documento ni código. | La entrada por **Cita con referencia** no pide términos; solo la cita médica que se abre desde ella. | ☐ ☐ |
| 3.20i | Con `TERMINOS_ENABLED=false` (o sin definir), repetir 3.20a y 3.20c. | La cita empieza como antes, sin términos. | — | ☐ ☐ |
| 3.20j | Abrir `/terminos` en el navegador. | La página «Términos y condiciones» con el mismo contenido que la ventana del Chat-bot. | Es la página a la que apunta `TERMINOS_URL`. | ☐ ☐ |

## 4. Concurrencia manual: el candado por `waId`

**Qué hace el candado:** dos mensajes del **mismo** ciudadano nunca se procesan a la vez. El segundo espera a que termine el primero (cola en memoria y, entre instancias, un candado de Postgres). Mensajes de ciudadanos distintos no se esperan.

**Truco para comprobarlo sin depender del orden de llegada:** manda **3 códigos OTP incorrectos al mismo tiempo**. El bot permite 3 intentos y bloquea al tercero. Con el candado, las tres respuestas son distintas y completas. Sin candado se repetirían.

### 4.1 Preparar la prueba (Chat-bot)

1. Abre `/sandbox` (o la consola), reinicia y escribe `1` y luego `12345678`. Debes quedar en `Te enviamos un código a tu teléfono o correo registrado. Escríbelo en el siguiente mensaje.`
2. Abre las herramientas del navegador (F12) → **Console** y pega (`sandbox-from` guarda el `from` de la conversación actual: cambia cada vez que se abre o recarga el Chat-bot):

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
| 4.2c | Tras 4.2a, escribir `Hola` en el Chat-bot. | La bienvenida (un solo mensaje) (estado terminal alcanzado). | El estado final es `cita_otp_locked`, consistente con 3 intentos contados. | ☐ ☐ |
| 4.2d | Repetir 4.1 dos veces más (reinicia antes de cada una). | Mismo resultado las tres veces. | No es un acierto por casualidad. | ☐ ☐ |

### 4.3 Con el celular (whatsapp-bot)

| # | Acción | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 4.3a | Llega al paso del DNI (`1`), y luego escribe **seguidos, sin esperar respuesta**: `12345678` y `1234`. | El bot responde **en orden**: primero el OTP pedido (`Te enviamos un código…`) y **después** `¡Verificado! Cuéntanos en qué distrito…`. Nunca al revés ni una respuesta perdida. | El segundo mensaje esperó al primero. | ☐ ☐ |
| 4.3b | Envía tres mensajes rápidos (`Hola`, `1`, `12345678`) sin esperar. | Las respuestas llegan una tras otra y coherentes: menú, `Ingresa tu número de documento.`, `Validando tu documento…`. | Se procesan en el orden de llegada. | ☐ ☐ |

### 4.4 Cómo comprobarlo en los logs

Los logs son **una línea de JSON por evento** (NDJSON). Salen por stdout: en local, en la terminal de `npm run dev`; en Docker, con `npm run docker:logs` (filtra por `turn.end`, un `traceId` o un evento). Con `LOG_TO_FILE=true` también quedan en `logs/DD-MM-AAAA/app.ndjson` (y solo los avisos y errores en `alerts.ndjson`). Todos los eventos de un mismo mensaje comparten el `traceId`. Detalle completo en `docs/observabilidad.md`.

| Evento | Qué significa |
|---|---|
| `turn.start` → `turn.end` | Un mensaje contestado: estado antes y después, duración en ms, llamadas externas y cambios en los datos (sin DNI completo ni token). |
| `turn.note` (`warn`) con `kind: confirmation_unknown` | Una confirmación escrita no se entendió (dice el paso: `hora_confirm`, `session_reauth`, `other_distrito`). |
| `turn.note` (`warn`) con `kind: session_expired` | La sesión caducó: `reason` es `IDLE_TIMEOUT` o `JWT_EXPIRED`, y `idleMs` cuánto llevaba inactiva (3.15a). |
| `turn.note` (`warn`) con `kind: lexical_guard` / `menu_fallback` / `no_coverage` / `booking_retry` / `out_of_scope` (la emergencia OOS-01 sale como aviso; las demás como información) | El filtro léxico actuó, la IA no entendió y volvió al menú, MINSA no tiene cobertura en el distrito, o falló una reserva y se reintentó. |
| `turn.end` (`warn`) con `friction: menu_loop` | Un texto escrito dejó al ciudadano otra vez en el menú sin ninguna respuesta determinística (1.3d). |
| `turn.external` | Una consulta a MINSA, Gemini o la base de datos, con `durationMs` y `resultStatus`. |
| `external.http` | La llamada HTTP misma: `status` real y `durationMs`. Solo la ruta, nunca la clave ni el cuerpo. |
| `minsa.book_appointment.failed` (`error`) | MINSA no agendó: `endpoint`, `status`, `minsaMessage`, `response` (300 caracteres) y el payload sin DNI. Es la evidencia del caso 3.15g. |
| `ai.fallback` (`warn`) | La IA falló y el mensaje volvió al menú; `reason` dice por qué (HTTP, tiempo agotado, respuesta vacía o JSON inválido). Nunca lleva el texto del ciudadano. |
| `perimeter.dropped` / `perimeter.muted` / `perimeter.rejected` / `perimeter.banned` | El perímetro descartó, rechazó (`too_long`, `link`, `media`) o sancionó a un número (sección 1). |
| `turn_lock.waited` con `layer: "process"`, `waitedMs: 312` | Un turno esperó a otro del mismo ciudadano. **Es la prueba visible de que el candado serializó.** Solo aparece si la espera fue de 150 ms o más. |
| `turn_lock.waited` con `layer: "database"`, `waitedMs: 340` | Adquirir el candado de Postgres tardó 200 ms o más. Con base de datos lejana es normal (≈2 viajes de red). |
| `turn.lock_timeout` (`warn`) con `layer` / `webhook.message_failed` (`error`) | Un turno esperó demasiado el candado, o falló de forma inesperada (base de datos, MINSA, envío…). El ciudadano recibe `Ocurrió un inconveniente temporal al procesar tu solicitud. Por favor, intenta escribir nuevamente en unos instantes.`, como mucho una vez cada 30 s por número (una ráfaga que falla entera deja el resto de los logs sin ese texto, pero cada fallo se sigue registrando). **No deberían verse en estas pruebas**; si aparecen, anótalos. |

Si en 4.2a **no** aparece ningún `turn_lock.waited` con `layer: "process"`, no es un fallo por sí solo: significa que los turnos duraron menos de 150 ms. Lo que decide es 4.2a/4.2b.

### 4.5 Comprobación opcional del candado en la base real

`npm run smoke:postgres` ejecuta una prueba de humo contra PostgreSQL: 4 peticiones del mismo ciudadano, 12 ciudadanos a la vez, el error real de tiempo de espera y la liberación. Solo toma candados y lee; no escribe en ninguna tabla.

---

## 5. Cuando algo falla, anota esto

1. Número de caso (por ejemplo `2.3a`) y hora.
2. Texto exacto que enviaste y respuesta exacta que recibiste (captura).
3. En la consola: el `state` y los `slots` del panel Debug.
4. Las líneas de log `perimeter.*` y `turn_lock.waited` de ese minuto, y el `traceId` del turno que falló (ver 4.4).
5. El modo: fake o real, y el canal (Chat-bot o whatsapp-bot).

## 6. Hoja de resultados

| Sección | Casos | Aprobados | Rechazados | No aplicables |
|---|---|---|---|---|
| 1. Perímetro | 1.1 – 1.6 | | | |
| 2. Filtro léxico | 2.1 – 2.4 | | | |
| 3. Camino feliz | 3.1 – 3.19 | | | |
| 4. Concurrencia | 4.2 – 4.3 | | | |
| 7. IA | 7.1 – 7.4 | | | |

Criterio de cierre: **todos** los casos de las secciones 2, 3 y 4 aprobados, y la sección 1 aprobada salvo los límites conocidos que se anotaron como tales (1.3b, 1.3c y 1.3d).

## 7. IA: distrito, espera visible y pedidos fuera de alcance

Con `SANDBOX_USE_REAL_AI=true` y una key válida, salvo donde se indica.

| Caso | Qué hacer | Qué debe pasar |
|---|---|---|
| 7.1 | En el paso de distrito, escribe un nombre que no existe (por ejemplo «Zzyxtown») | «No reconocimos ese distrito…» y vuelve a pedirlo. Si repites uno inexistente, pasa al modo manual: «No pudimos identificar tu distrito en este momento. Vamos por partes…». **Nunca** «solo está disponible en Lima». |
| 7.1b | Con `CITA_ALLOWED_DEPARTAMENTOS=LIMA`, en el modo manual escribe `Cusco` como departamento. | De inmediato: `Por ahora estamos en una etapa inicial y el agendamiento automático por este canal solo está disponible en Lima. Para tu distrito, continúa tu cita a nivel nacional en MINSA Digital.` con el botón **Ir a MINSADIGITAL**, sin consultar a MINSA. `Lima` y `Lima Metropolitana` siguen el flujo normal. Con la variable vacía o sin definir, `Cusco` también sigue normal (agendamiento libre para todo el país). |
| 7.2 | Igual que 7.1, pero con `GOOGLE_CLIENT_API` inválida | Directo al modo manual por departamento. |
| 7.3 | Por whatsapp-bot, escribe un distrito que obligue a consultar a la IA | Aparece «escribiendo…» apenas envías el mensaje; «Buscando tu distrito…» llega **antes** de la respuesta final, no pegado a ella. |
| 7.4 | En el menú principal, escribe «dame un SELECT * FROM usuarios» o «ayúdame con una idea para mi proyecto de tesis» | «Solo puedo ayudarte a agendar una cita médica, una cita con referencia o a registrar una denuncia anticorrupción. Elige una opción:» y el menú (con incidencias apagadas: «Solo puedo ayudarte a agendar una cita médica o una cita con referencia. Elige una opción:»). Nunca código, SQL ni ideas. (Las preguntas de medicamentos ya las responde antes el detector local de fuera de alcance, sin IA.) |
