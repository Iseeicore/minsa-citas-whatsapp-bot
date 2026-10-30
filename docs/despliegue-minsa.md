# Despliegue en MINSA: base de datos, variables y comprobaciones

Para infraestructura. Resume lo que hay que preparar para desplegar la imagen Docker del bot con incidencias (apagadas por defecto: ver `INCIDENCIAS_ENABLED` en la sección 3.3). Los pasos cortos están en el [README](../README.md#despliegue-con-pocos-pasos); la imagen y su arranque, en la [sección 9](#9-imagen-docker-y-arranque).

## 1. Qué cambió respecto al despliegue anterior

- **Las incidencias se guardan en PostgreSQL.** Hace falta `DATABASE_ENABLED=true` y `DATABASE_URL`.
- **Las migraciones se reescribieron.** Una base creada con la versión anterior no se actualiza: hay que usar una base **nueva y vacía**.
- **Las páginas del Chat-bot quedan ocultas y la bandeja web, cerrada**, salvo que se defina `SANDBOX_PAGE_ENABLED=true`. `POST /api/sandbox`, que usa el portal de MINSA Digital, no cambia.
- **La imagen sigue sin credenciales dentro.** Todo entra por variables de entorno.
- **El servicio de referencias se llama ahora «Cita con referencia», sin variable nueva.** Está siempre encendido y depende del endpoint de referencias de MINSA (`/whatsapp/api/v1/references`) y de `SANDBOX_USE_REAL_MINSA=true`; el detalle, en [flujo-referencias.md](flujo-referencias.md). «Agendar una cita médica» ya no consulta referencias después del OTP.
- **Términos y condiciones antes de la cita, apagados por defecto.** `TERMINOS_ENABLED=true` los muestra antes de agendar una cita médica y `TERMINOS_URL` (sin valor por defecto) es la página que enlaza WhatsApp, por ejemplo `https://<host-del-bot>/terminos`. Cada aceptación se guarda en la tabla nueva `chatbot.aceptacion_terminos`, que crea la migración `20261029130000_aceptacion_terminos`.

## 2. Requisitos de la base (PostgreSQL 16)

- Una base **vacía**, con un usuario que sea su **dueño** y **no sea superusuario**. Debe poder crear esquemas, tablas, funciones y disparadores. Si la base no existe, el usuario necesita `CREATEDB` para que el contenedor la cree; si no, créenla antes con `CREATE DATABASE <base> OWNER <usuario>`.
- El paquete **`contrib`** de PostgreSQL, que trae las extensiones `pg_trgm` y `unaccent`. Comprobación, que debe devolver las dos filas:

  ```sql
  SELECT name FROM pg_available_extensions WHERE name IN ('pg_trgm','unaccent');
  ```

- **Identificadores `uuid`:** los genera la base con `gen_random_uuid()`, que ya trae PostgreSQL 16; no hace falta ninguna función propia.
- Si la clave tiene caracteres especiales (`@ : / ? #`), van codificados en la URL.
- **Recomendado:** `ALTER DATABASE <base> SET jit = off;`. La base la comparte el backend de incidencias; en sus consultas de la bandeja, con JIT apagado una pasó de 926 ms a 255 ms. No se midió con las consultas del bot.
- Probado: las 2 migraciones y los archivos de `prisma/sql` y `prisma/seeds/catalogos` se aplican enteros en PostgreSQL 16.

## 3. Variables

### 3.1 Las que ya tienen

```bash
META_APP_SECRET=
META_WEBHOOK_VERIFY_TOKEN=
META_ACCESS_TOKEN=
META_PHONE_NUMBER_ID=
META_GRAPH_API_VERSION=v21.0

MINSA_API_HOST=https://dminsadigital.minsa.gob.pe/back
MINSA_INTEGRATION_SECRET=
MINSA_CONVERSATION_ID_PLACEHOLDER=
SANDBOX_USE_REAL_MINSA=true
CITA_ALLOWED_DEPARTAMENTOS=LIMA

AI_PROVIDER=gemini
GOOGLE_CLIENT_API=
GOOGLE_AI_MODEL=gemini-3.6-flash
SANDBOX_USE_REAL_AI=true

SANDBOX_ENABLED=true
SANDBOX_ALLOWED_ORIGINS=https://dminsadigital.minsa.gob.pe
```

Sin cambios. Los secretos se completan en el servidor. `SANDBOX_USE_REAL_*` no es solo del Chat-bot: activa la IA y MINSA en todo el bot, y en producción debe estar en `true` para lo que se use.

### 3.2 Nuevas y obligatorias

```bash
DATABASE_ENABLED=true
DATABASE_URL=postgresql://<usuario>:<clave>@<host>:5432/<base>
MINSA_DIGITAL_APP_URL=https://dminsadigital.minsa.gob.pe
```

Qué hace cada una y qué pasa si falta: [3.6](#36-referencia-de-todas-las-variables).

### 3.3 Nuevas y opcionales

Sin definir, el valor por defecto es el correcto.

```bash
SANDBOX_PAGE_ENABLED=
SANDBOX_SHARED_SECRET=
INCIDENCIAS_ENABLED=false
TERMINOS_ENABLED=false
TERMINOS_URL=
MEDIA_STORAGE_BASE_URL=
MEDIA_STORAGE_TOKEN=
MEDIA_STORAGE_TIMEOUT_MS=
EVIDENCE_IMAGE_MAX_MB=
LOG_LEVEL=info
LOG_TO_FILE=false
```

Qué hace cada una y su valor por defecto: [3.6](#36-referencia-de-todas-las-variables).

Hay otras opcionales (`INBOUND_RATE_LIMIT`, `TURN_DB_LOCK`, `TURN_LOCK_TIMEOUT_MS`, `TURN_LOCK_MAX_CONCURRENCY`, `TURN_PROCESS_LOCK_TIMEOUT_MS`, `LOG_DIR`). Vacías o sin definir valen lo mismo; no hace falta incluirlas. Un `0` no desactiva nada: vuelve al valor por defecto.

### 3.4 No definir, salvo indicación expresa

- `RESET_DATABASE_CONFIRM`: **destructiva**, borra la base y migra desde cero en cada arranque mientras siga puesta. Ver la [sección 9.2](#92-borrar-la-base-y-migrar-desde-cero).
- `SANDBOX_PAGE_ENABLED=true`: abre una bandeja sin autenticación.
- `INBOUND_RATE_LIMIT=off` y `TURN_DB_LOCK=off`: quitan la protección contra ráfagas de mensajes y contra procesar dos veces un mismo turno.

### 3.5 Una variable que este código no lee

`WEBHOOK_CHANNEL_SECRET` aparece en el ambiente, pero **ningún archivo de este repositorio la lee**. Confirmen qué componente la usa. Si es de otro sistema, déjenla; si no la usa nadie, pueden quitarla.

### 3.6 Referencia de todas las variables

Una fila por variable: qué hace y qué pasa sin definirla. El bloque para copiar está en el [README](../README.md#variables-de-entorno).

- `.env.example` es solo la lista de variables, sin comentarios ni espacios alrededor del valor (`NOMBRE=valor`). Empieza con el bloque `##### Mínimo` (lo que necesita el servidor del MINSA en Docker: whatsapp-bot y el Chat-bot conectado al portal) y sigue con `##### Completo` (las opcionales). Nunca lleva valores reales: se versiona.
- Una variable vacía equivale a no definirla: se usa el valor por defecto. En las numéricas, un `0` tampoco desactiva nada.
- Docker Compose pasa al contenedor **todas** las variables del `.env` (`env_file`) y solo fija tres, que ganan sobre el `.env`: `NODE_ENV=production`, `PORT=3000` y `HOSTNAME=0.0.0.0`.

**WhatsApp (Meta)**

| Variable | Para qué sirve | Sin definir |
|---|---|---|
| `META_APP_SECRET` | Secreto de la app: valida la firma HMAC (`X-Hub-Signature-256`) de cada webhook | Obligatoria: el compose se detiene y la nombra. Si aun así falta o está en blanco, el webhook rechaza con 403 todo lo que llega (nunca valida con una clave vacía), registra `webhook.signature_secret_missing` y `/api/health` responde `degraded` con `META_APP_SECRET_MISSING` |
| `META_WEBHOOK_VERIFY_TOKEN` | Token que se elige; Meta lo envía en el `GET` de verificación del webhook | Obligatoria: el compose se detiene y la nombra |
| `META_ACCESS_TOKEN` | Token de acceso con el que se envían los mensajes | Obligatoria: el compose se detiene y la nombra. Si aun así falta, se registra al arrancar como `config.invalid` (`META_ACCESS_TOKEN_MISSING`) y `/api/health` responde `degraded` |
| `META_PHONE_NUMBER_ID` | ID del número de WhatsApp desde el que responde el bot | Obligatoria: el compose se detiene y la nombra. Si aun así falta, se registra al arrancar como `config.invalid` (`META_PHONE_NUMBER_ID_MISSING`) y `/api/health` responde `degraded` |
| `META_GRAPH_API_VERSION` | Versión de Graph API, sin espacios | `v21.0` |

**Base de datos y contenedor**

| Variable | Para qué sirve | Sin definir |
|---|---|---|
| `DATABASE_ENABLED` | Solo el valor exacto `false` apaga la base; cualquier otro la activa. Ver [modos de persistencia](desarrollo.md#modos-de-persistencia) | Fuera del compose, con base. El compose la toma como `false`: ahí va `true` de forma explícita. Sin base, las incidencias **no se pueden guardar** |
| `DATABASE_URL` | Conexión a PostgreSQL. Con la base activa, el contenedor aplica las migraciones pendientes al arrancar; fuera de Docker, `npm run build` también la necesita porque migra y aplica `prisma/sql` | Con la base activa, el contenedor **se detiene** con un error. No hace falta con `DATABASE_ENABLED=false` |
| `RESET_DATABASE_CONFIRM` | **Destructiva, solo Docker.** Si vale lo mismo que el nombre de la base de `DATABASE_URL`, el arranque borra los esquemas y migra desde cero. Ver [9.2](#92-borrar-la-base-y-migrar-desde-cero) | No borra nada. No la definan salvo indicación expresa |
| `HOST_PORT` | Solo Docker Compose: puerto publicado en el servidor | `3000` |

**MINSA** (con `SANDBOX_USE_REAL_MINSA` apagada, el bot usa datos de prueba fijos)

| Variable | Para qué sirve | Sin definir |
|---|---|---|
| `SANDBOX_USE_REAL_MINSA` | `true`: MINSA real (identidad, catálogo, agendamiento y referencias). **La lee también el webhook real, no solo el Chat-bot** | Datos de prueba fijos |
| `MINSA_API_HOST` | Host de la API del MINSA | Sin valor por defecto. Con `SANDBOX_USE_REAL_MINSA=true`, si falta se registra al arrancar como `config.invalid` (`MINSA_API_HOST_MISSING`) y `/api/health` responde `degraded` |
| `MINSA_INTEGRATION_SECRET` | Secreto con el que se firma la petición de identidad (documento y OTP) | Sin valor por defecto. Con `SANDBOX_USE_REAL_MINSA=true`, si falta se registra al arrancar como `config.invalid` (`MINSA_INTEGRATION_SECRET_MISSING`) y `/api/health` responde `degraded` |
| `MINSA_CONVERSATION_ID_PLACEHOLDER` | ID de conversación que el MINSA exige en la petición de identidad | Sin valor por defecto |
| `MINSA_DIGITAL_APP_URL` | URL pública del portal de MINSA Digital, sin valor por defecto en el código. De ella salen los botones hacia el portal (**Continuar mi cita**, **Ir a MINSADIGITAL**, **Cita Nivel Global** y **Ver mi cita**) y las cabeceras `Origin` y `Referer` de las llamadas autenticadas al MINSA (se toma el origen: esquema, dominio y puerto). Si cambia el dominio, solo se cambia esta variable | Obligatoria: el compose no arranca y la nombra. Si aun así falta, la bienvenida de whatsapp-bot muestra el menú, los demás avisos salen como texto sin enlace y `/api/health` responde `degraded` con `MINSA_DIGITAL_APP_URL_MISSING` (`error` con el MINSA real, `warn` con el simulado). Con el MINSA real, las llamadas autenticadas se cortan con un 503 sin cuerpo, se registra `minsa.request_blocked` y quien llamó lo trata como un error del MINSA |
| `CITA_ALLOWED_DEPARTAMENTOS` | Departamentos donde se agenda por este canal (alcance del piloto), separados por comas: `LIMA`, `LIMA,CALLAO`… Un distrito fuera de la lista recibe el enlace a MINSA Digital; aplica también al modo manual (departamento → provincia → distrito) | Sin filtro: todo el Perú. En producción se define de forma explícita, por ejemplo `LIMA` |

**Banderas** (se leen en cada mensaje: cambiarlas exige reiniciar el proceso, no recompilar)

| Variable | Para qué sirve | Sin definir |
|---|---|---|
| `INCIDENCIAS_ENABLED` | `true` (sin distinguir mayúsculas ni espacios) ofrece **Registrar una incidencia** y **Consultar una incidencia** en el menú de whatsapp-bot y del Chat-bot. Para guardarlas hacen falta también `DATABASE_ENABLED=true` y `DATABASE_URL`. **Para usar incidencias, pónganla en `true`** | Apagada (también vacía o con cualquier otro valor): el menú ofrece solo **Agendar una cita médica** y **Cita con referencia**. Ni el `3` o `4` escritos, ni las palabras clave, ni un código `MINSA-AAAA-NNNNNN` (o `MINSA-AAAA-A-NNNNNN`), ni una sesión que quedó a medias llegan a esos flujos: el bot responde que por ahora solo agenda citas y consulta referencias, y muestra el menú |
| `TERMINOS_ENABLED` | `true` (sin distinguir mayúsculas ni espacios) muestra los términos y condiciones antes de agendar una cita médica, en los dos canales; **Cita con referencia** no los pide. En el Chat-bot salen en una ventana con la casilla «Acepto los términos y condiciones»; en WhatsApp, con los botones **Acepto** y **No acepto**. Cada aceptación se guarda en `chatbot.aceptacion_terminos` (sin base, solo en la memoria del proceso) | Apagada: la cita empieza sin términos |
| `TERMINOS_URL` | Página de los términos que enlaza el botón **Ver términos** de WhatsApp, por ejemplo `https://<host-del-bot>/terminos` (el bot publica el mismo texto en `/terminos`) | Sin valor por defecto: WhatsApp muestra solo **Acepto** y **No acepto** y queda el aviso `terminos.url_missing` en el log |

**Imágenes de evidencia.** Hasta 5 por incidencia, de hasta `EVIDENCE_IMAGE_MAX_MB` cada una. Las que llegan juntas en WhatsApp reciben **una sola respuesta** que dice cuántas se guardaron y por qué no las otras; al llegar a 5 esa respuesta ya trae el resumen para registrar, y la persona toca **Listo** cuando termina. Los PDF y demás documentos todavía no se guardan: el bot lo dice. Detalle en [flujo-incidencia.md](flujo-incidencia.md).

| Variable | Para qué sirve | Sin definir |
|---|---|---|
| `EVIDENCE_IMAGE_MAX_MB` | Peso máximo de cada imagen, en MB, para whatsapp-bot y el Chat-bot (el Chat-bot lo recibe del servidor). Entero de `1` a `5`: Meta no admite imágenes de más de 5 MB | `5`. Un valor fuera de rango o no numérico se ignora, se registra al arrancar como `config.invalid` (`EVIDENCE_IMAGE_MAX_MB_INVALID`) y `/api/health` responde `degraded` |
| `MEDIA_STORAGE_BASE_URL` | URL del servicio de imágenes. El bot le hace `POST` con los bytes de la foto (cabecera `Content-Type` con su tipo) y espera `{ "ruta": "..." }`; esa ruta es lo que se guarda como evidencia. Contrato a confirmar con OGTI | Las imágenes se guardan en la propia base, en base64, en `chatbot.evidencia.ruta` |
| `MEDIA_STORAGE_TOKEN` | Credencial del servicio, si la pide: se envía como `Authorization: Bearer` | Sin cabecera |
| `MEDIA_STORAGE_TIMEOUT_MS` | Tiempo máximo de la subida, en milisegundos. Si vence, la incidencia no se guarda y el ciudadano puede reintentar | `10000` |

**IA**

| Variable | Para qué sirve | Sin definir |
|---|---|---|
| `SANDBOX_USE_REAL_AI` | `true`: IA real (intención del mensaje libre, distrito, fecha y pistas) en todo el bot, no solo en el Chat-bot | Diccionario de prueba, sin costo: no entiende texto libre ni distritos mal escritos |
| `AI_PROVIDER` | Proveedor de IA; vacía o `gemini` es Gemini, hoy el único. Cómo sumar otro: [desarrollo.md](desarrollo.md#cambiar-de-proveedor-de-ia) | Gemini. Un valor desconocido apaga la IA real (respaldo fijo), se registra al arrancar como `config.invalid` (`AI_PROVIDER_UNKNOWN`) y `/api/health` responde `degraded` |
| `GOOGLE_CLIENT_API` | API key de Google AI. Viaja en la cabecera `x-goog-api-key`, nunca en la URL | Vacía o inválida: Gemini falla y el mensaje libre vuelve al menú (log `ai.fallback`). Con `SANDBOX_USE_REAL_AI=true`, si falta se registra al arrancar como `config.invalid` (`GOOGLE_CLIENT_API_MISSING`) y `/api/health` responde `degraded` |
| `GOOGLE_AI_MODEL` | Modelo de Gemini. Un nombre que no existe da HTTP 404 | `gemini-3.6-flash` |

**Chat-bot** (variables `SANDBOX_*`)

| Variable | Para qué sirve | Sin definir |
|---|---|---|
| `SANDBOX_ENABLED` | `true` habilita `POST /api/sandbox`, que usa el portal de MINSA Digital y no tiene autenticación propia. Con las `SANDBOX_USE_REAL_*` en `true` llama a servicios reales y puede agendar citas reales | `POST /api/sandbox` y su `OPTIONS` responden 404 |
| `SANDBOX_ALLOWED_ORIGINS` | Orígenes permitidos (CORS), separados por comas, para el Chat-bot en otro frontend. Una barra final se ignora. Ver la [sección 10](#10-conectar-el-portal-de-minsa-digital-chat-bot) | Ningún origen externo puede leer las respuestas |
| `SANDBOX_SHARED_SECRET` | Valor aleatorio largo (32 bytes) compartido con el servidor del portal. Con él, `POST /api/sandbox` exige `x-sandbox-timestamp` y `x-sandbox-signature` (`sha256=` + HMAC-SHA256 de `timestamp.cuerpo`) y responde 401 sin firma válida o con una marca de tiempo de más de 5 minutos. Debe ser distinto de `META_APP_SECRET` y de `MINSA_INTEGRATION_SECRET`. Las páginas del visor no firman: no las activen en un despliegue con este secreto | Sin firma: cualquiera que conozca la URL puede llamar a la ruta con `curl` |
| `SANDBOX_PAGE_ENABLED` | `true` muestra `/sandbox` y `/configuracion-visor-sandbox`, deja que `/` redirija a `/sandbox` y **abre la bandeja web** (`/api/conversations*` y `/api/messages/send`), que no tiene autenticación: lista todas las conversaciones con su teléfono y permite escribir desde el número oficial. No afecta a `POST /api/sandbox` | Las tres páginas redirigen a `/api/health` y las rutas de la bandeja responden 404, aunque la base esté activa. **En producción, déjenla sin definir** |

**Logs** (ver [observabilidad.md](observabilidad.md))

| Variable | Para qué sirve | Sin definir |
|---|---|---|
| `LOG_LEVEL` | Nivel mínimo: `info`, `warn`, `error` o `silent` | `info` |
| `LOG_TO_FILE` | `true` escribe también en `logs/DD-MM-AAAA/app.ndjson` y `alerts.ndjson`, además de stdout. En Docker los archivos quedan dentro del contenedor: la copia duradera es stdout (`docker compose logs -f`) | Solo stdout, lo adecuado para Docker |
| `LOG_DIR` | Carpeta de los logs en archivo | `logs` |

**Perímetro y candado de turno** (defínanlas solo para cambiar su valor por defecto)

| Variable | Para qué sirve | Sin definir |
|---|---|---|
| `INBOUND_RATE_LIMIT` | `off` desactiva el límite de mensajes entrantes (más de 20 en 60 s bloquea al número por 1 hora) y el de las imágenes del paso de evidencia, que cuentan aparte para que un álbum no silencie el número. Solo para depurar en local | Límite activo |
| `TURN_PROCESS_LOCK_TIMEOUT_MS` | Espera máxima en la cola en memoria del proceso, en milisegundos | `30000` |
| `TURN_LOCK_TIMEOUT_MS` | `lock_timeout` del candado en Postgres, en milisegundos | `10000` |
| `TURN_LOCK_MAX_CONCURRENCY` | Turnos con candado de Postgres a la vez por instancia | `4` |
| `TURN_DB_LOCK` | `off` desactiva el candado de Postgres y deja solo el de memoria | Candado activo |

## 4. Qué enciende cada función

| Función | Variables | Si faltan |
|---|---|---|
| WhatsApp | las 4 `META_*` | El compose se detiene y nombra la que falta |
| Citas con datos reales | `SANDBOX_USE_REAL_MINSA=true`, `MINSA_API_HOST`, `MINSA_INTEGRATION_SECRET`, `MINSA_DIGITAL_APP_URL` | Datos simulados |
| IA del bot | `SANDBOX_USE_REAL_AI=true` y `GOOGLE_CLIENT_API` | Respuestas fijas; no entiende texto libre ni distritos mal escritos |
| Cita con referencia | `SANDBOX_USE_REAL_MINSA=true`, `MINSA_API_HOST`, `MINSA_INTEGRATION_SECRET`, `MINSA_DIGITAL_APP_URL` y que el backend de MINSA publique `/whatsapp/api/v1/references`. No lleva bandera ni variable nueva | Siempre responde «No pudimos consultar tus referencias en este momento. Inténtalo de nuevo más tarde.» y ofrece agendar una cita. Los DNI de demostración `10308523` y `47391441` son la excepción, solo en este servicio |
| Incidencias | `INCIDENCIAS_ENABLED=true`, `DATABASE_ENABLED=true` y `DATABASE_URL` | Sin la primera, no aparecen en el menú; sin las otras dos, no se guardan |
| Términos antes de la cita | `TERMINOS_ENABLED=true`; para el enlace de WhatsApp, `TERMINOS_URL` | Sin la primera, la cita no los muestra; sin base de datos, la aceptación solo queda en la memoria del proceso |
| Portal de MINSA Digital | `SANDBOX_ENABLED=true` y `SANDBOX_ALLOWED_ORIGINS` | `POST /api/sandbox` y su `OPTIONS` responden 404 |
| Firma del portal | `SANDBOX_SHARED_SECRET`, el mismo valor aleatorio en el bot y en el servidor del portal | Sin definir, `POST /api/sandbox` no exige firma |

## 5. Despliegue

1. Crear la base según la sección 2.
2. Preparar el `.env` con las variables de la sección 3, junto a `docker-compose.yml`.
3. Construir y levantar la imagen (`npm run docker:up`, o el procedimiento propio de infraestructura sobre el mismo `Dockerfile`).
4. El contenedor aplica las migraciones al arrancar. En el log aparecen mensajes `[entrypoint]`; el último, si todo salió bien, es `Base lista. Iniciando el servicio.` (antes aplica las migraciones y después los archivos de `prisma/sql` y las semillas de `prisma/seeds/catalogos`) Si fallan, el contenedor se detiene con un mensaje que indica qué revisar. En el log pueden aparecer `Error: Invariant violation` (primer arranque) o `Error: P3012` (reinicios): vienen del paso que intenta marcar como revertida la migración inicial, son **inofensivos** y el arranque continúa.

## 6. Comprobaciones posteriores

| Comprobación | Resultado esperado |
|---|---|
| `GET /api/health` | `{"status":"ok","database":"enabled"}`. Con `degraded`, el campo `config` lista los códigos de lo que está mal. No consulta la base ni las credenciales de Meta |
| `GET /sandbox` y `GET /configuracion-visor-sandbox` | Redirigen (307) a `/api/health` |
| `GET /api/conversations` | `404` |
| `GET /webhook/whatsapp` sin los parámetros de Meta | `403` |
| Tabla `public._prisma_migrations` | 13 filas con `finished_at` |
| `POST /api/sandbox` desde el origen del portal | Responde, con la cabecera CORS del origen permitido |

## 7. Carga inicial: hospitales y administrador

El arranque carga solo las funciones, los disparadores, los comentarios y las semillas de catálogo (`prisma/sql` y `prisma/seeds/catalogos`). **No carga hospitales ni usuarios**: la imagen no trae `psql` ni el padrón. Los hospitales y el administrador los carga un DBA, una sola vez, con los pasos de abajo.

Las funciones `catalogo.cargar_hospitales_fase_1`, `catalogo.retirar_hospitales_fase_1` y `gestion.crear_administrador` las crea el arranque desde `prisma/sql/functions/`; no se ejecutan solas. Cada una tiene su descripción en la base (`\df+ catalogo.*_hospitales_fase_1`).

**Los 4 hospitales** (código RENIPRESS tal como los guarda el bot, sin ceros a la izquierda):

| Código | Nombre | DIRIS |
|---|---|---|
| `6206` | HOSPITAL NACIONAL DOS DE MAYO | DIRIS Lima Centro |
| `5946` | Hospital Nacional Hipólito Unanue | DIRIS Lima Este |
| `6215` | HOSPITAL NACIONAL DOCENTE MADRE NIÑO SAN BARTOLOME | DIRIS Lima Centro |
| `33381` | Hospital de Lima Este - Vitarte (III-E) | DIRIS Lima Este |

**Carga.** La ejecuta un DBA, con el usuario dueño de la base, una sola vez después de que el contenedor arrancó. Los pasos 1 y 3 se pueden repetir sin riesgo.

1. Cargar los hospitales:

   ```sql
   SELECT catalogo.cargar_hospitales_fase_1();
   ```

   - Crea o corrige las áreas `DIRIS-LC` y `DIRIS-LE`, el área `EESS-<código>` de cada hospital (hija de su DIRIS) y su fila en `catalogo.establecimiento_salud` con nivel de atención III. Todo ocurre en una sola transacción: o queda completo o no cambia nada.
   - Devuelve cuántos hospitales **creó o corrigió**: `4` la primera vez y `0` si ya estaban iguales. Se puede ejecutar más de una vez sin duplicar filas ni dejar registros de auditoría.
   - Si el padrón completo se carga después con `npm run db:seed:eess`, no cambia estos 4 hospitales.

2. Verificar que quedaron los 4 hospitales (deben salir 4 filas):

   ```sql
   SELECT codigo_renipress, nombre FROM catalogo.establecimiento_salud WHERE codigo_renipress IN ('6206', '5946', '6215', '33381');
   ```

3. Crear el usuario administrador con su correo y la huella Argon2id de su clave. La huella se genera fuera de la base, porque PostgreSQL no calcula Argon2, y la clave nunca se envía:

   ```sql
   SELECT gestion.crear_administrador('<correo>', '<huella Argon2id>', 'Administrador');
   ```

   Resultado esperado: `1`. Devuelve `0` si el correo ya existía y no cambia nada. Falla si no se hizo el paso 1.

4. Verificar el usuario (debe salir una fila con `activo = true`):

   ```sql
   SELECT correo, activo FROM gestion.usuario_interno WHERE correo = '<correo>';
   ```

**Retiro.** Solo para deshacer la carga mientras los hospitales no se usen:

```sql
SELECT catalogo.retirar_hospitales_fase_1();
```

- Borra únicamente estos 4 hospitales y sus áreas `EESS-<código>`, y las áreas `DIRIS-LC` y `DIRIS-LE` solo si quedaron sin áreas hijas, usuarios ni incidencias. Devuelve cuántos hospitales retiró (`0` si no estaban cargados).
- **Se niega** (error `restrict_violation`, código `23001`, sin borrar nada) si alguno de los 4 ya tiene incidencias, derivaciones o usuarios; el mensaje nombra cada código y cuántos tiene. Nunca borra incidencias ni usuarios.

El backend de incidencias también trae su script `crear-admin`, que lee `ADMIN_NOMBRE`, `ADMIN_CORREO` y `ADMIN_PASSWORD` (12 caracteres o más). Esos valores los define quien lo ejecuta y no se guardan en el repositorio.

## 8. Datos de la persona que se identifica

El bot **ya no consulta el nombre en RENIEC**: la persona que decide identificarse escribe su número de documento (8 dígitos es un DNI; 9, un carnet de extranjería) y el bot solo lo guarda con la incidencia, sin pedir nombre ni alias. El nombre lo resolverá el backend de incidencias (`minsa-incidencias-backend`) con un servicio que todavía no está definido. Por eso `RENIEC_LOOKUP_BASE_URL` y `SANDBOX_USE_REAL_RENIEC` ya no existen: si siguen en el servidor, se pueden quitar.

## 9. Imagen Docker y arranque

`npm run docker:up` (o `docker compose up -d --build --wait --wait-timeout 180`) construye la imagen, levanta el contenedor y **espera hasta que el healthcheck lo marque sano**. Si falta una credencial obligatoria, Docker Compose se detiene con un mensaje que la nombra, en lugar de arrancar un bot roto.

| Comando | Qué hace |
|---|---|
| `npm run docker:up` | Construye la imagen y levanta el contenedor en segundo plano; termina cuando está sano (máximo 180 s) |
| `npm run docker:logs` | Muestra los logs del contenedor en vivo |
| `npm run docker:down` | Detiene y elimina el contenedor |

- **Base:** `node:22-alpine` (la misma versión de Node que usa el CI), multi-stage, compilada con `npm run build:no-db` y la salida *standalone* de Next.
- **Seguridad:** corre con el usuario sin privilegios `node`; los secretos solo entran como variables de entorno, nunca quedan dentro de la imagen.
- **Salud:** el `HEALTHCHECK` consulta `GET /api/health`, que no toca la base de datos. Responde `200` con `status: "ok"`, o `status: "degraded"` y los códigos en `config` si hay una variable mal configurada; el contenedor no se reinicia por eso.
- **Puerto:** 3000 dentro del contenedor; `HOST_PORT` cambia el puerto publicado en el servidor.
- **Variables:** las tres que fija el compose (`NODE_ENV`, `PORT`, `HOSTNAME`) evitan que un valor olvidado en el `.env` saque al servidor del puerto que usan el mapeo y el healthcheck. Son obligatorias las 4 credenciales de Meta y `MINSA_DIGITAL_APP_URL`.
- **Tiempo de arranque:** el `start_period` del healthcheck es de 60 s para dar tiempo a la primera migración. El compose no define un servicio de base de datos: con `DATABASE_ENABLED=true`, Prisma usa el PostgreSQL de `DATABASE_URL`.
- **Webhook de Meta:** la URL de callback es `https://<servidor>/webhook/whatsapp`. El HTTPS lo termina el proxy inverso del servidor, no el contenedor.
- **Prisma:** la imagen trae el CLI en `/opt/prisma` (versión fijada por `PRISMA_VERSION` en el `Dockerfile`, igual a la de `package.json`).

### 9.1 Arranque con base de datos

El contenedor arranca con `scripts/docker-entrypoint.sh`, que decide según `DATABASE_ENABLED` y `DATABASE_URL`:

| `DATABASE_ENABLED` | `DATABASE_URL` | Qué pasa |
|---|---|---|
| distinta de `false` (por ejemplo `true`) | con valor | Ejecuta `prisma migrate deploy`, aplica `prisma/sql` y `prisma/seeds/catalogos` y, si todo termina bien, inicia el servicio. Si algo falla, el contenedor se detiene con un mensaje |
| distinta de `false` | vacía | **Se detiene** con un error: la base está activa pero no hay a dónde conectarse |
| `false` | vacía | Inicia **sin base** y deja una advertencia en el log |
| `false` | con valor | Inicia **sin base**, no migra y deja una advertencia en el log (un `DATABASE_URL` sobrante no apaga el servicio, pero queda a la vista) |

- **Pongan `true` de forma explícita.** El compose convierte una `DATABASE_ENABLED` vacía en `false` (`${DATABASE_ENABLED:-false}`); vacía solo activa la base fuera del compose, por ejemplo en desarrollo local.
- **Si la base no existe, el contenedor la crea** al migrar, siempre que el usuario tenga `CREATEDB`; sin ese permiso falla con `permission denied to create database` y el DBA debe crearla vacía antes (sección 2). Las migraciones se aplican en cada arranque; si no hay pendientes, no hace nada.
- Si una migración falla, el log muestra el código de Prisma (P3005, P3009 o P3018) con el siguiente paso; ver [`prisma/README.md`](../prisma/README.md#instalación).
- Con varias réplicas, Prisma toma un candado en la base, así que dos arranques simultáneos no migran a la vez. Aun así el proyecto corre con una sola.
- En cada arranque con base, el entrypoint marca como revertida la migración `20261024120000_estructura` si quedó fallida, para poder reintentarla; si ya está aplicada, no hace nada.

### 9.2 Borrar la base y migrar desde cero

`RESET_DATABASE_CONFIRM` es opcional y **destructiva**. Sirve para rehacer una base de pruebas o para pasar una base a migraciones reescritas, cuyo historial ya no coincide con el de este código.

```bash
RESET_DATABASE_CONFIRM=<nombre exacto de la base de DATABASE_URL>
```

- **Qué borra:** los esquemas `catalogo`, `chatbot`, `gestion` e `ia`, las funciones `fn_*` de `public` y el historial de migraciones (`_prisma_migrations`). Después aplica todas las migraciones desde cero. Se pierden las incidencias, los usuarios y todo lo demás.
- **Cuándo no borra:** sin la variable, nunca. Si su valor no coincide con el nombre de la base, el servicio no arranca y no borra nada.
- **Úsenla una sola vez y quítenla del ambiente antes del siguiente despliegue.** Mientras siga puesta, **cada reinicio vuelve a borrar todo**: no hay ninguna marca que impida repetirlo.
- **No la usen con incidencias reales.**
- **Requiere el esquema `public` sin tablas ajenas a Prisma** (en un despliegue normal solo está `_prisma_migrations`, que el reset borra). Si las hay, tras borrar los esquemas `migrate deploy` falla con `P3005` y la base queda sin esquemas: quiten esas tablas y vuelvan a arrancar.

## 10. Conectar el portal de MINSA Digital (Chat-bot)

Para que otro sitio, por ejemplo el portal de MINSA Digital, converse con el bot a través de `POST /api/sandbox`:

```bash
SANDBOX_ENABLED=true
SANDBOX_ALLOWED_ORIGINS=https://dminsadigital.minsa.gob.pe
SANDBOX_SHARED_SECRET=<valor aleatorio largo, el mismo en el servidor del portal>
```

- **Sin `SANDBOX_ENABLED=true`** la ruta responde 404, aunque el origen esté permitido. Lo mismo vale para el `OPTIONS` previo: con el Chat-bot apagado también responde 404, así que no delata que la ruta existe.
- **Con `SANDBOX_SHARED_SECRET`** solo el servidor del portal puede llamar a la ruta: firma cada petición y el navegador nunca ve el secreto. Quien llame con `curl` sin firma recibe 401.
- **Cada entrada se reduce a su origen** (esquema + dominio + puerto): `https://dminsadigital.minsa.gob.pe/` también funciona. Varias entradas se separan con comas.
- **Una entrada que no es una URL** (un dominio sin `https://`, un `*`) se ignora y se registra una sola vez en el log `sandbox.cors_invalid_origin`. Nunca se acepta un comodín.
- **CORS no es autenticación.** Solo le dice al navegador qué sitios pueden leer las respuestas; quien llame a la API directamente (con `curl`, por ejemplo) no está limitado. Con `SANDBOX_USE_REAL_MINSA=true`, `/api/sandbox` consulta al MINSA real y puede agendar citas reales.
- **Una sola instancia sin base de datos.** Sin base, el estado de cada conversación vive en la memoria del proceso: una segunda réplica no vería esas sesiones. Ver [modos de persistencia](desarrollo.md#modos-de-persistencia).
