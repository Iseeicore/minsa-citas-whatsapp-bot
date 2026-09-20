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
| Fechas | mañana y pasado mañana en hora de Lima, mostradas como `AAAAMMDD` (ej. `20260920`) |
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
| Primer mensaje normal | Bienvenida y el botón **Seguir aquí** (no corre el bot ni la IA). | Igual: bienvenida y el botón **Seguir aquí**. |
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
| 1.1a | Enviar el texto de 383 caracteres como **primer mensaje**. | Un solo mensaje de texto: `Este es el canal oficial del *MINSA*. No podemos atender mensajes muy largos (máximo 300 caracteres) ni con enlaces. Escribe un mensaje corto, por ejemplo: *Hola*.` Sin bienvenida, sin botones, sin menú. | Sin IA. Sin escribir en la base: no crea conversación ni sesión. Sin candado. Log: `[perimeter] rejected a first message from ...NNNN: too_long` (solo WhatsApp). | ☐ ☐ |
| 1.1b | Enviar `('a' * 301)` como primer mensaje. | El mismo texto de rechazo. | Igual que 1.1a. | ☐ ☐ |
| 1.1c | Enviar `('a' * 300)` como primer mensaje. | **No** se rechaza. Bienvenida y botón **Seguir aquí** (WhatsApp y Sandbox). | El límite es «más de 300». | ☐ ☐ |
| 1.1d | Tras 1.1a, enviar `Hola`. | Se comporta como primer contacto normal (bienvenida). | El rechazo no dejó sesión. | ☐ ☐ |
| 1.1e | **WhatsApp:** abrir **Chat real** tras 1.1a. | Tu número **no** aparece como conversación nueva. | Confirma que no se escribió nada. | ☐ ☐ |
| 1.1f | Con sesión abierta (ya en el flujo de reclamo, en el paso de la descripción), enviar el texto de 383 caracteres. | **No** se rechaza: el bot lo acepta como descripción del reclamo (permite hasta 1000). | El filtro solo aplica al primer mensaje. | ☐ ☐ |

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
| 1.3b | Primer mensaje: `🔥🔥🔥💰💰💰` | **No** se bloquea. Bienvenida y **Seguir aquí** (WhatsApp y Sandbox). | **0 IA** en ambos canales (el primer contacto no corre el bot). Sin errores. | ☐ ☐ |
| 1.3c | Primer mensaje: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` (48 letras). | **No** se bloquea (es corto). Igual que 1.3b. | Sin errores. | ☐ ☐ |
| 1.3d | Con sesión abierta y en el menú: `🔥🔥🔥💰💰💰` | Aparece `Un momento, estamos revisando tu mensaje…` y luego el menú. | En modo real es **1 llamada a Gemini** (sale unclear y cae al menú). Sin errores. | ☐ ☐ |

### 1.4 Multimedia sin sesión — solo WhatsApp (excepto imagen)

Requiere un número **sin sesión** (ver 0.4).

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 1.4a | **WhatsApp:** enviar una **foto** como primer mensaje. | Solo texto: `Este es el canal oficial del *MINSA*. Por ahora solo podemos atenderte con mensajes de texto. Escribe *Hola* para comenzar.` | **No** descarga la foto (sin llamadas a Graph para media). Sin IA, sin base de datos, sin candado. Log: `... rejected a first message from ...NNNN: media`. | ☐ ☐ |
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
| 1.5a | Enviar `hola` **6 veces en menos de 10 segundos** (copia el texto y pulsa enviar rápido). | Se atienden los primeros 5. Del sexto en adelante: **ningún** mensaje de respuesta (silencio). | Descarte silencioso: sin respuesta, sin base de datos, sin IA. Meta recibe igualmente su 200 (no reintenta). Log por cada mensaje descartado: `[perimeter] dropped a message from ...NNNN: more than 5 in 10 s`. | ☐ ☐ |
| 1.5b | Esperar 10 segundos y enviar `hola`. | Vuelve a responder con normalidad. | La ventana es deslizante: los mensajes viejos salen del conteo. | ☐ ☐ |
| 1.5c | Enviar mensajes sostenidos hasta pasar de 20 en un minuto (uno cada 2–3 s durante un minuto). | El bot deja de responder. Sigue en silencio aunque escribas tras unos minutos. | Sanción de 1 hora. Log: `[perimeter] waId ...NNNN banned for 1 hour (more than 20 messages in 60 s)`. | ☐ ☐ |
| 1.5d | Escribir con **otro** número mientras el primero está sancionado. | El segundo número responde normalmente. | La sanción es por número, no global. | ☐ ☐ |

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
| 3.1a | `Hola` (sesión nueva). | Solo la bienvenida grande con **[Continuar mi cita]** y, después, `¿Prefieres seguir por aquí mismo?` con el botón **[Seguir aquí]**. **Sin** el menú `¿En qué podemos ayudarte hoy?`. | Igual en Sandbox y WhatsApp. **Sin IA:** no aparece «Un momento…». La sesión queda en `main_menu`. | ☐ ☐ |
| 3.1b | Tocar **Seguir aquí** (o escribir `hola`). | Recién ahora: el menú `¿En qué podemos ayudarte hoy?` con las filas **Agendar una cita médica** y **Registrar un reclamo**. | El menú depende de la respuesta del ciudadano, no del primer mensaje. Sin IA. | ☐ ☐ |
| 3.1c | Con **sesión nueva**, primer mensaje: `Sabes quiero una cita para san Juan de Lurigancho para medicina general`. | **Un solo mensaje:** `¡Hola! Te ayudaremos a agendar tu cita de Medicina General en San Juan de Lurigancho. Para comenzar, por favor indícanos tu número de DNI (8 dígitos):`. **Sin** bienvenida ni menú. | Sin IA. Slots (panel Debug): `citaDistritoHintText` = `San Juan de Lurigancho`, `citaEspecialidadHintText` = `Medicina General`. Reiniciar antes de seguir con 3.2. | ☐ ☐ |
| 3.2 | `1` | `Ingresa tu DNI (8 dígitos).` **Sin** volver a mostrar el menú. | Atajo numérico: `2` haría lo mismo con el reclamo. Sin IA. | ☐ ☐ |
| 3.3 | `1234567` (7 dígitos) | `DNI inválido. Debe tener 8 dígitos. Intenta de nuevo.` | Validación de formato, sin IA. | ☐ ☐ |
| 3.4 | `12345678` | `Validando tu DNI…` y `Te enviamos un código a tu teléfono registrado. Escríbelo aquí (4-8 dígitos).` | Llamada a MINSA (fake). | ☐ ☐ |
| 3.5 | `0000` | `Código incorrecto. Te quedan 2 intento(s).` | Cuenta el intento. | ☐ ☐ |
| 3.6 | `1234` | `Verificando código…` y `¡Verificado! Cuéntanos en qué distrito buscas atención (ej. "Miraflores").` | Guarda el token. | ☐ ☐ |
| 3.7 | `asdfghjk` | `No reconocimos ese distrito. Por favor escribe el nombre de tu distrito o comuna:` | **Sin IA:** el filtro de basura lo corta antes de Gemini. Sigue en el mismo paso. | ☐ ☐ |
| 3.8 | `qwertyuiop` | El mismo mensaje. | Igual. | ☐ ☐ |
| 3.9 | `Lurigancjo` (error leve) | **Modo real:** `Buscando tu distrito: "Lurigancjo"…` y continúa (la IA lo corrige). **Modo fake:** `Buscando tu distrito: "Lurigancjo"…` y el botón **Cita Nivel Global** (el fake no corrige errores). | En modo real: **1 llamada a IA**. Aquí sí se llama a la IA (no es basura). | ☐ ☐ |
| 3.10 | Reiniciar y llegar al paso 3.6 de nuevo. Escribir `Lurigancho`. | `Buscando tu ubigeo…`, `Entendido. Buscando especialidades y citas disponibles en *Lurigancho*…` y la lista `Selecciona la especialidad:` (MEDICINA GENERAL, ODONTOLOGIA). | Resuelto **sin IA** con el padrón local. | ☐ ☐ |
| 3.11 | `odontología` (texto, sin tocar la lista) | `Buscando establecimientos…`, `Establecimiento encontrado: CENTRO DE SALUD LURIGANCHO. Buscando fechas disponibles…` y la lista `Selecciona la fecha:`. | Coincide el nombre con la fila ofrecida. Sin IA. | ☐ ☐ |
| 3.12 | `1` | `Buscando horarios disponibles…` y la lista `Selecciona el horario:` (08:00 - 08:30, 09:30 - 10:00, 13:00 - 13:30). | En listas, `1` es la posición 1. | ☐ ☐ |

> **Gap conocido (`docs/technical-gaps.md`, G1):** si un día ofrece **un solo** horario, o si la última página de «Ver más horarios» deja un solo horario, el bot agenda **sin pedir confirmación**. Con el catálogo fake (tres horarios) no ocurre. Si lo encuentras en modo real, anótalo como **Gap conocido**, no como fallo nuevo.

### 3.13 Selección de horario (parte de la lista `08:00 / 09:30 / 13:00`)

Vuelve a la lista de horarios (3.12) antes de cada caso. Tras cada confirmación intermedia, toca **No, ver horarios**.

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 3.13a | `8` (⚙) | `¿Confirmas el horario 08:00 - 08:30?` con **[Sí, confirmar]** **[No, ver horarios]**. | No existe la opción 8, pero sí un horario 08:00: resuelve a la hora y **pide confirmación**. No agenda solo. | ☐ ☐ |
| 3.13b | `3` (⚙) | `¿Confirmas el horario 13:00 - 13:30?` | La posición 3 es 13:00 y no hay 3 AM ni 3 PM: resuelve directo, con confirmación. | ☐ ☐ |
| 3.13c | `1` (⚙) | `¿A qué te refieres con "1"? Opción 1: 08:00, o 1:00 PM (13:00).` con dos botones **[Opción 1: 08:00]** y **[1:00 PM: 13:00]**. | Hay dos lecturas distintas: pregunta. **No agenda.** | ☐ ☐ |
| 3.13d | Tras 3.13c, tocar **1:00 PM: 13:00**. | `Agendando tu cita…`, la constancia y el cierre (ver 3.14). | El botón nombra la hora exacta: agenda directo. | ☐ ☐ |
| 3.13e | Repetir 3.13c y tocar **Opción 1: 08:00**. | Agenda la cita de las 08:00. | Igual. | ☐ ☐ |
| 3.13f | Repetir 3.13c y, en vez de tocar un botón, escribir `1 pm`. | `¿Confirmas el horario 13:00 - 13:30?` | Escribir una hora vale como una respuesta normal. | ☐ ☐ |
| 3.13g | `en la tarde` | `¿Confirmas el horario 13:00 - 13:30?` | Filtra solo los horarios de 12:00 en adelante (solo hay uno). | ☐ ☐ |
| 3.13h | `a las 9 y media` | `¿Confirmas el horario 09:30 - 10:00?` | Entiende 12h y lo cruza con lo ofrecido. Lo que se envía a MINSA es siempre `09:30` (24h de la fila). | ☐ ☐ |
| 3.13i | `a la 1` | `¿Confirmas el horario 13:00 - 13:30?` | «a la 1» tiene marcador de hora: no es la posición 1. | ☐ ☐ |
| 3.13j | `5` | `Selecciona una opción de la lista.` y la lista de nuevo. | No es posición ni hora ofrecida: se rechaza y **no** viaja a MINSA. | ☐ ☐ |
| 3.13k | `a las 3` | `No hay horarios disponibles a esa hora. Elige uno de la lista:` y la lista. | Entendida pero no ofrecida. | ☐ ☐ |
| 3.13l | `hdp` | `Le recordamos que este es un canal institucional oficial del MINSA y mantenemos una política de respeto.` y la lista de nuevo. | El filtro también protege los pasos de selección. | ☐ ☐ |

### 3.14 Confirmación y cierre

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 3.14a | Tocar **Sí, confirmar** (o escribir `sí`). | Cuatro mensajes: `Agendando tu cita…`; la constancia que empieza con `*MINISTERIO DE SALUD DEL PERÚ*`; el enlace **[Ver mi cita]**; y `Gracias por comunicarte con el *Ministerio de Salud del Perú*. Si necesitas agendar otra cita o realizar una consulta, escríbenos nuevamente cuando lo necesites. ¡Que tengas un buen día! 👋`. | Estado final `cita_booked`. Se agendó una sola vez. | ☐ ☐ |
| 3.14b | Tocar **No, ver horarios**. | `Sin problema. Elige otro horario:` y la lista. | No se agenda. | ☐ ☐ |
| 3.14c | Tras 3.14a, escribir `Hola`. | La bienvenida grande y el botón **Seguir aquí**, **sin** el menú encima. | Reinicio tras un estado terminal: mismo tratamiento que un primer mensaje (3.1a). Con un pedido claro (`quiero una cita en Miraflores`) entra directo a la cita, como 3.1c. | ☐ ☐ |

### 3.15 Comportamientos añadidos tras la prueba de campo

| # | Acción del usuario | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 3.15a | Con el OTP ya verificado (por ejemplo tras 3.6), esperar **más de 10 minutos** y escribir cualquier cosa (`Miraflores`). | `⏳ Tu sesión ha expirado por inactividad. Por tu seguridad, necesitamos confirmar nuevamente tu identidad para continuar con tu cita. ¿Deseas solicitar un nuevo código de verificación?` con `[1] Sí, enviar código` y `[2] Cancelar y volver al menú`, y los botones **[Sí, enviar código]** y **[Cancelar]**. | Estado `cita_awaiting_reauth`. Se borran el token de MINSA y los datos del horario; el DNI y lo ya elegido (distrito, especialidad…) se conservan. Solo aplica cuando el bot espera al ciudadano con sesión verificada. | ☐ ☐ |
| 3.15b | Tras 3.15a, escribir `si por favor` (o `1`, o tocar **Sí, enviar código**). | `Enviándote un nuevo código de verificación…` y `Te enviamos un código a tu teléfono registrado. Escríbelo aquí (4-8 dígitos).` Tras el código (`1234` en fake) continúa en el paso donde estaba. | Reusa el DNI guardado, no lo pide de nuevo. Sin IA. | ☐ ☐ |
| 3.15c | Repetir 3.15a y responder `no, gracias` (o `2`, o **Cancelar**). | El menú `¿En qué podemos ayudarte hoy?`. | La sesión queda vacía, sin token ni DNI. | ☐ ☐ |
| 3.15d | En `¿Confirmas el horario …?` escribir `Si por favor` (también `dale`, `ok`, `de acuerdo`). | `Agendando tu cita…` y sigue como con el botón. Con `no, gracias`, `otro horario` o `ver mas` vuelve `Sin problema. Elige otro horario:`. | Reconocedor de sí/no sin IA. Con algo ambiguo (`si pero a las 3`) repite los botones sin agendar. | ☐ ☐ |
| 3.15e | Con la sesión ya iniciada (tras **Seguir aquí**), escribir `Quiero una cita en San Juan de Lurigancho para poder atenderme en medicina general`. | `¡Entendido! Quieres agendar una cita médica. Antes de continuar necesito verificar tu identidad — ingresa tu DNI (8 dígitos).` **Sin** `Un momento, estamos revisando tu mensaje…`. | **Sin IA.** Mismos slots que 3.1c. | ☐ ☐ |
| 3.15f | Escribir `hdp` en el menú y, tras la advertencia, `ya dale` (también `continuar`, `vamos`, `sigue`). | El menú `¿En qué podemos ayudarte hoy?`, sin `Un momento…`. | Equivale a tocar **Continuar**. Solo vale justo después de la advertencia. | ☐ ☐ |
| 3.15g | Solo con MINSA real: provocar que la reserva falle (por ejemplo un cupo tomado). | `No pudimos reservar ese horario, puede que otra persona lo haya tomado justo antes. Te muestro los horarios disponibles de la misma fecha:` y la lista de nuevo. A la tercera falla: `No pudimos agendar tu cita. Intenta de nuevo más tarde.` | Log `[minsa] book_appointment failed: HTTP …` con el estado, el inicio de la respuesta y el payload sin DNI (ver 4.4). | ☐ ☐ |
| 3.15h | Con el OTP verificado, escribir un distrito que MINSA devuelva junto a vecinos (solo con MINSA real, por ejemplo `San Juan de Lurigancho`). | `Entendido. Buscando especialidades y citas disponibles en *San Juan de Lurigancho*…` y luego la lista de especialidades. **Sin** `Selecciona tu ubigeo:`. | Si entre los resultados hay uno que es exactamente el distrito ya resuelto, se elige solo. Si la lista sí aparece y se responde con texto (`San Juan de Lurigancho`), el mismo mensaje `Entendido…` nombra el distrito. | ☐ ☐ |
| 3.15i | Solo con MINSA real: elegir un distrito sin especialidades disponibles. | `No encontramos especialidades disponibles en *{distrito}* en este momento.` `¿Deseas buscar en otro distrito cercano?` con `[1] Sí, buscar otro distrito` `[2] No, salir` y los botones **[Sí, otro distrito]** y **[No, salir]**. | Estado `cita_awaiting_other_distrito`: la conversación **no** se cierra. Un texto suelto (`quee ?`) repite la pregunta, sin bienvenida. | ☐ ☐ |
| 3.15j | Tras 3.15i, responder `sí` (o `dale`, `cambiar`, `1`, o tocar **Sí, otro distrito**). | `Perfecto. Cuéntanos en qué otro distrito buscas atención (ej. "Miraflores").` | Se olvida el distrito anterior (y el primer mensaje, para que no lo vuelva a usar); se conservan el DNI y la verificación. | ☐ ☐ |
| 3.15k | Tras 3.15i, responder `no` (o `salir`, `cancelar`, `2`, o tocar **No, salir**). | `Gracias por comunicarte con el *Ministerio de Salud del Perú*. Cuando quieras volver a intentarlo, escríbenos nuevamente. ¡Que tengas un buen día! 👋` | Sesión limpia (estado `cita_no_coverage_closed`). Escribir `Hola` después da la bienvenida y **Seguir aquí**. | ☐ ☐ |

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
| 4.2c | Tras 4.2a, escribir `Hola` en el Sandbox. | La bienvenida grande y el botón **Seguir aquí** (estado terminal alcanzado). | El estado final es `cita_otp_locked`, consistente con 3 intentos contados. | ☐ ☐ |
| 4.2d | Repetir 4.1 dos veces más (reinicia antes de cada una). | Mismo resultado las tres veces. | No es un acierto por casualidad. | ☐ ☐ |

### 4.3 Con el celular (WhatsApp)

| # | Acción | Respuesta esperada | Comportamiento interno | Aprobado / Rechazado |
|---|---|---|---|---|
| 4.3a | Llega al paso del DNI (`1`), y luego escribe **seguidos, sin esperar respuesta**: `12345678` y `1234`. | El bot responde **en orden**: primero el OTP pedido (`Te enviamos un código…`) y **después** `¡Verificado! Cuéntanos en qué distrito…`. Nunca al revés ni una respuesta perdida. | El segundo mensaje esperó al primero. | ☐ ☐ |
| 4.3b | Envía tres mensajes rápidos (`Hola`, `1`, `12345678`) sin esperar. | Las respuestas llegan una tras otra y coherentes: menú, `Ingresa tu DNI (8 dígitos).`, `Validando tu DNI…`. | Se procesan en el orden de llegada. | ☐ ☐ |

### 4.4 Cómo comprobarlo en los logs

Los logs los ves en **Vercel** (proyecto → Logs, filtra por `turn-lock`) o, en local, en la terminal donde corre `npm run dev`.

| Línea de log | Qué significa |
|---|---|
| `[turn-lock] turn waited 312 ms behind an earlier turn of ...1234` | Un turno esperó a otro del mismo ciudadano (los 4 últimos dígitos del número). **Es la prueba visible de que el candado serializó.** Solo aparece si la espera fue de 150 ms o más. |
| `[turn-lock] database lock for ...1234 took 340 ms` | Adquirir el candado de Postgres tardó 200 ms o más. Con base de datos lejana es normal (≈2 viajes de red). |
| `[perimeter] dropped a message from ...1234: more than 5 in 10 s` | El limitador descartó un mensaje (1.5). |
| `[perimeter] rejected a first message from ...1234: too_long` (o `link`, `media`) | El filtro de primer mensaje (sección 1). |
| `[minsa] book_appointment failed: HTTP 409 body=… payload={…}` | MINSA no agendó. Trae el estado, los primeros 300 caracteres de su respuesta (con cualquier número de 8 o más dígitos tapado) y el payload sin el DNI. Es la evidencia para el caso 3.15g. |
| `[ai] analyze_main_menu_intent fell back to the menu: HTTP 403 …` | La IA falló y el mensaje libre volvió al menú. El motivo dice por qué (HTTP, tiempo agotado, respuesta vacía o JSON inválido). Nunca incluye el texto del ciudadano. |
| `Failed to process webhook entry` seguido de `TurnLockTimeoutError` | Un turno esperó demasiado el candado y se abandonó. **No debería verse en estas pruebas**; si aparece, anótalo. |

Si en 4.2a **no** aparece ningún `[turn-lock] turn waited`, no es un fallo por sí solo: significa que los turnos duraron menos de 150 ms. Lo que decide es 4.2a/4.2b.

### 4.5 Comprobación opcional del candado en la base real

`npm run smoke:neon` ejecuta una prueba de humo contra Neon: 4 peticiones del mismo ciudadano, 12 ciudadanos a la vez, el error real de tiempo de espera y la liberación. Solo toma candados y lee; no escribe en ninguna tabla.

---

## 5. Cuando algo falla, anota esto

1. Número de caso (por ejemplo `2.3a`) y hora.
2. Texto exacto que enviaste y respuesta exacta que recibiste (captura).
3. En la consola: el `state` y los `slots` del panel Debug.
4. Las líneas de log que empiecen con `[perimeter]` o `[turn-lock]` de ese minuto.
5. El modo: fake o real, y el canal (Sandbox o WhatsApp).

## 6. Hoja de resultados

| Sección | Casos | Aprobados | Rechazados | No aplicables |
|---|---|---|---|---|
| 1. Perímetro | 1.1 – 1.5 | | | |
| 2. Filtro léxico | 2.1 – 2.4 | | | |
| 3. Camino feliz | 3.1 – 3.15 | | | |
| 4. Concurrencia | 4.2 – 4.3 | | | |

Criterio de cierre: **todos** los casos de las secciones 2, 3 y 4 aprobados, y la sección 1 aprobada salvo los límites conocidos que se anotaron como tales (1.3b, 1.3c y 1.3d).
