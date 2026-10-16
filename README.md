# Bot de citas MINSA

Bot que atiende a la ciudadanía por dos canales: **whatsapp-bot** (WhatsApp Business Cloud API) y **Chat-bot** (el chat web que usa el portal de MINSA Digital y las páginas de prueba del proyecto). Agenda citas médicas en el MINSA, consulta las referencias médicas registradas, registra y consulta incidencias (apagadas por defecto: ver `INCIDENCIAS_ENABLED`) y deriva urgencias y consultas fuera de alcance a los canales oficiales. Está construido con Next.js (App Router) y PostgreSQL, y también corre sin base de datos (ver [Modos de persistencia](#modos-de-persistencia)).

## Canales

Los dos canales usan la misma máquina de estados (`lib/fsm/`); cambia cómo llega y cómo se muestra el mensaje.

| Canal | Entrada | Quién lo usa | Se activa con |
|---|---|---|---|
| **whatsapp-bot** | `POST /webhook/whatsapp` (Meta) | La ciudadanía, por WhatsApp | Las credenciales de Meta (obligatorias) |
| **Chat-bot** | `POST /api/sandbox`, y las páginas `/sandbox` y `/configuracion-visor-sandbox` | El portal de MINSA Digital, y el equipo para probar los flujos | `SANDBOX_ENABLED=true` (la ruta) y `SANDBOX_PAGE_ENABLED=true` (las páginas) |

- Los nombres `SANDBOX_*`, `/api/sandbox` y `/sandbox` son identificadores históricos del Chat-bot en el código y no se renombran.
- El menú del Chat-bot muestra además la fila **Consultar referencia**; en whatsapp-bot se llega a ese servicio escribiendo «referencia».
- Una incidencia se guarda siempre con el canal de origen WhatsApp, también cuando viene del Chat-bot.

## Inicio rápido

| Quiero… | Comando | Detalle |
|---|---|---|
| Levantar el bot en Docker (servidor MINSA) | `npm run docker:up` | [Ejecutar con Docker](#ejecutar-con-docker-servidor-minsa) |
| Desarrollar en local | `npm run dev` | [Desarrollo local](#desarrollo-local) |
| Correr las pruebas | `npm test` | [Pruebas](#pruebas) |

## Ejecutar con Docker (servidor MINSA)

Un solo comando construye la imagen, levanta el contenedor y **espera hasta que el healthcheck lo marque sano**:

```bash
npm run docker:up
```

1. Copia `.env.example` a `.env` (ignorado por git) junto a `docker-compose.yml` y completa, como mínimo, el bloque **`##### Mínimo`**: Meta, MINSA, Gemini, el Chat-bot para el frontend conectado y `DATABASE_ENABLED=false` (ver [Variables de entorno](#variables-de-entorno)).
2. Ejecuta `npm run docker:up`. Si falta una credencial obligatoria, Docker Compose se detiene con un mensaje que la nombra, en lugar de arrancar un bot roto.
3. Verifica que responde:

   ```bash
   curl http://localhost:3000/api/health
   # {"status":"ok","database":"disabled"}
   ```

| Comando | Qué hace |
|---|---|
| `npm run docker:up` | Construye la imagen y levanta el contenedor en segundo plano; termina cuando está sano (máximo 180 s). |
| `npm run docker:logs` | Muestra los logs del contenedor en vivo. |
| `npm run docker:down` | Detiene y elimina el contenedor. |

**Desarrollo local con hot-reload sobre el mismo compose.** Copia `docker-compose.override.yml.example` a `docker-compose.override.yml` (ignorado por git, nunca se versiona) y Docker Compose lo carga automáticamente junto al archivo base: monta el código fuente como volumen, corre `npm run dev` dentro del contenedor y excluye `node_modules`/`.next` del bind mount.

Detalles de la imagen:

- **Base:** `node:22-alpine` (la misma versión de Node que usa el CI), multi-stage, compilada con `npm run build:no-db` y la salida *standalone* de Next.
- **Seguridad:** corre con el usuario sin privilegios `node`; los secretos solo entran como variables de entorno, nunca quedan dentro de la imagen.
- **Salud:** el `HEALTHCHECK` consulta `GET /api/health`, que no toca la base de datos. Responde `200` con `status: "ok"`, o `status: "degraded"` y los códigos en `config` si hay una variable mal configurada (ver [Manejo de errores](#manejo-de-errores)); el contenedor no se reinicia por eso.
- **Puerto:** 3000 dentro del contenedor; `HOST_PORT` cambia el puerto publicado en el servidor (por defecto 3000).
- **Variables:** `docker-compose.yml` pasa al contenedor **todas** las variables del `.env` (`env_file`). Solo fija tres, que ganan sobre `env_file`: `NODE_ENV=production`, `PORT=3000` y `HOSTNAME=0.0.0.0`, para que un valor olvidado en el `.env` no saque al servidor del puerto que usan el mapeo y el healthcheck. Son obligatorias las 4 credenciales de Meta y `MINSA_DIGITAL_APP_URL`.
- **Base de datos:** `DATABASE_ENABLED` vale `false` si no se define. La imagen se compila sin base, pero **al arrancar el contenedor aplica solo las migraciones pendientes** (ver [Arranque con base de datos](#arranque-con-base-de-datos)): no hay un paso aparte para infraestructura.
- **Tiempo de arranque:** el `start_period` del healthcheck es de 60 s para dar tiempo a la primera migración. El compose no define un servicio de base de datos: con `DATABASE_ENABLED=true`, Prisma usa el PostgreSQL de `DATABASE_URL`.
- **Webhook de Meta:** configura la URL de callback como `https://<servidor>/webhook/whatsapp`. El HTTPS lo termina el proxy inverso del servidor, no el contenedor.

### Arranque con base de datos

El contenedor arranca con `scripts/docker-entrypoint.sh`, que decide según `DATABASE_ENABLED` y `DATABASE_URL`:

| `DATABASE_ENABLED` | `DATABASE_URL` | Qué pasa |
|---|---|---|
| distinta de `false` (por ejemplo `true`) | con valor | Ejecuta `prisma migrate deploy` y, si termina bien, inicia el servicio. Si las migraciones fallan, el contenedor se detiene con un mensaje |
| distinta de `false` | vacía | **Se detiene** con un error: la base está activa pero no hay a dónde conectarse |
| `false` | vacía | Inicia **sin base** y deja una advertencia en el log |
| `false` | con valor | Inicia **sin base**, no migra y deja una advertencia en el log (un `DATABASE_URL` sobrante no apaga el servicio, pero queda a la vista) |

Para usar la base en Docker, en el `.env`:

```bash
DATABASE_URL=postgresql://<usuario>:<clave>@<host>:5432/<base>
DATABASE_ENABLED=true
```

- **Pon `true` de forma explícita.** El compose convierte una `DATABASE_ENABLED` vacía en `false` (`${DATABASE_ENABLED:-false}`); vacía solo activa la base en Vercel, que no pasa por el compose.
- El usuario debe ser dueño de la base y poder crear esquemas, tablas, funciones y disparadores. **Si la base no existe, el contenedor la crea** al migrar, siempre que el usuario tenga el permiso `CREATEDB`; sin ese permiso falla con `permission denied to create database` y el DBA debe crearla vacía antes, con el usuario como dueño (`CREATE DATABASE <base> OWNER <usuario>`). Las migraciones se aplican en cada arranque; si no hay pendientes, no hace nada.
- Con varias réplicas, Prisma toma un candado en la base, así que dos arranques simultáneos no migran a la vez. Aun así el proyecto corre con una sola.
- Si la clave tiene caracteres especiales (`@ : / ? #`), van codificados en la URL (`%40`, `%3A`...).
- La imagen trae el CLI de Prisma en `/opt/prisma` (versión fijada por `PRISMA_VERSION` en el `Dockerfile`, igual a la de `package.json`).

#### Borrar la base y migrar desde cero

`RESET_DATABASE_CONFIRM` es opcional y **destructiva**. Sirve para rehacer una base de pruebas o para pasar una base a migraciones reescritas, cuyo historial ya no coincide con el de este código.

```bash
RESET_DATABASE_CONFIRM=<nombre exacto de la base de DATABASE_URL>
```

- **Qué borra:** los esquemas `catalogo`, `chatbot`, `gestion` e `ia`, las funciones `fn_*` de `public` y el historial de migraciones (`_prisma_migrations`). Después aplica todas las migraciones desde cero. Se pierden las incidencias, los usuarios y todo lo demás.
- **Cuándo no borra:** sin la variable, nunca. Si su valor no coincide con el nombre de la base, el servicio no arranca y no borra nada.
- **Úsala una sola vez y quítala del ambiente antes del siguiente despliegue.** Mientras siga puesta, **cada reinicio vuelve a borrar todo**: no hay ninguna marca que impida repetirlo.
- **No la uses con incidencias reales.**
- **Requiere el esquema `public` sin tablas ajenas a Prisma** (en un despliegue normal solo está `_prisma_migrations`, que el reset borra). Si las hay, tras borrar los esquemas `migrate deploy` falla con `P3005` y la base queda sin esquemas: quita esas tablas y vuelve a arrancar.
- En cada arranque con base, el entrypoint además marca como revertida la migración inicial (`20261004000000_init`) si quedó fallida, para poder reintentarla; si ya está aplicada, no hace nada.

### Conectar un frontend externo (Chat-bot)

Para que otro sitio, por ejemplo el portal de MINSA Digital, converse con el bot a través de `POST /api/sandbox`, el bloque mínimo ya trae `SANDBOX_ENABLED=true`; completa el origen:

```bash
SANDBOX_ENABLED=true
SANDBOX_ALLOWED_ORIGINS=https://dminsadigital.minsa.gob.pe
```

- **Sin `SANDBOX_ENABLED=true`** la ruta responde 404, aunque el origen esté permitido.
- **Cada entrada se reduce a su origen** (esquema + dominio + puerto): `https://dminsadigital.minsa.gob.pe/` también funciona. Varias entradas se separan con comas.
- **Una entrada que no es una URL** (un dominio sin `https://`, un `*`) se ignora y se registra una sola vez en el log `sandbox.cors_invalid_origin`. Nunca se acepta un comodín.

> **CORS no es autenticación.** Solo le dice al navegador qué sitios pueden leer las respuestas; quien llame a la API directamente (con `curl`, por ejemplo) no está limitado. Con `SANDBOX_USE_REAL_MINSA=true`, `/api/sandbox` consulta al MINSA real y puede agendar citas reales.

> **Una sola instancia.** En este modo el estado de cada conversación vive en la memoria del proceso. Una segunda réplica no vería esas sesiones y rompería los flujos a la mitad, y un reinicio hace que quien estaba en medio de un trámite empiece de nuevo. Ver [Modos de persistencia](#modos-de-persistencia).

## Desarrollo local

1. Instala las dependencias (también ejecuta `prisma generate` mediante `postinstall`):

   ```bash
   npm install
   ```

2. Copia `.env.example` a `.env` y completa los valores reales (un `DATABASE_URL` de PostgreSQL y las credenciales de WhatsApp Cloud API). **Deja `DATABASE_ENABLED` vacía:** el `false` del bloque mínimo es para el servidor en Docker.
3. Aplica el esquema a tu base de datos de desarrollo (requiere PostgreSQL 18, que aporta `uuidv7()`; con PostgreSQL 17 hay que cambiar ese valor por defecto por `gen_random_uuid()`):

   ```bash
   npx prisma migrate deploy
   ```

   La migración inicial crea cuatro esquemas (`catalogo`, `chatbot`, `gestion` e `ia`), las reglas y disparadores de auditoría, las semillas de los catálogos y la descripción de cada tabla y columna. Las reglas para versionar cambios de la base (migraciones nuevas, pruebas SQL y diccionario) están en [`prisma/README.md`](prisma/README.md).

4. (Opcional) Carga datos de arranque. Solo corren contra una base cuyo nombre termine en `_desechable`, `_dev` o `_local`, y necesitan `psql` y `DATABASE_URL`:

   - `npm run db:seed:eess` carga el padrón de establecimientos (`--base-real=<base>` lo permite en otra base).
   - `npm run db:seed:dev` carga incidencias de ejemplo; si ya existen, `--reiniciar` las borra y las vuelve a crear.

5. Levanta el servidor de desarrollo:

   ```bash
   npm run dev
   ```

## Modos de persistencia

El bot corre de dos formas: **con base de datos** (Vercel + PostgreSQL, con bandeja web de conversaciones) o **sin base de datos** (servidor del MINSA en Docker: solo responde mensajes y no guarda nada). La variable `DATABASE_ENABLED` decide si el bot usa base de datos. Solo el valor exacto `false` la desactiva; vacía o con cualquier otro valor, la base de datos sigue activa.

| Aspecto | Con base de datos (por defecto, Vercel) | Sin base de datos (`DATABASE_ENABLED=false`, Docker) |
|---|---|---|
| ORM (Prisma) | Conectado a PostgreSQL | Nunca se instancia ni abre conexión; `DATABASE_URL` puede faltar |
| Estado de cada conversación | Tabla `chatbot.sesion_conversacion` | En memoria; se descarta tras 1 h sin actividad (6 × el timeout de sesión de 10 min, para que el aviso de «tu sesión expiró» siga funcionando) |
| Reentregas de Meta (no responder dos veces) | Índice único `wa_message_id` | Lista en memoria de ids de mensaje, conservada 24 h |
| Usuarios, historial de mensajes y estados de entrega | Tablas `chatbot.usuario` y `chatbot.mensaje` | No se guarda nada |
| Incidencias | Tabla `chatbot.incidencia_paciente`, con historial de cambios | **No se pueden guardar**: el bot responde que no pudo registrar la incidencia |
| Bandeja web (`/api/conversations*`, `/api/messages/send`) | Disponible solo con `SANDBOX_PAGE_ENABLED=true`; sin ella responde `404` | Con `SANDBOX_PAGE_ENABLED=true` responde `503` con `{"error":"PERSISTENCE_DISABLED","message":"…"}`; sin ella, `404` |
| Candado de turno por ciudadano | Postgres (advisory lock) | En memoria, aunque exista `DATABASE_URL` |
| Build | `npm run build` (aplica migraciones) | `npm run build:no-db` (sin migraciones) |

Escalar el modo sin base de datos a varias instancias requiere un almacén compartido externo, con expiración, detrás de `lib/fsm/session/session-store.ts` y `lib/whatsapp/webhook/inbound-dedupe.ts`. Hoy el proyecto no usa ninguno.

## Variables de entorno

`.env.example` es solo la lista de variables, sin comentarios: **esta sección es su documentación.** Cópialo a `.env` y completa los valores. Está dividido en dos bloques:

| Bloque | Qué contiene | Cuándo basta |
|---|---|---|
| `##### Mínimo: servidor MINSA en Docker (…)` | Meta (5), MINSA (6, incluye `MINSA_DIGITAL_APP_URL` y `CITA_ALLOWED_DEPARTAMENTOS=LIMA`), IA (`AI_PROVIDER=gemini` y las 3 de Gemini), Chat-bot (`SANDBOX_ENABLED=true`, `SANDBOX_ALLOWED_ORIGINS`) y `DATABASE_ENABLED=false` | El servidor del MINSA en Docker: whatsapp-bot (citas) y el Chat-bot conectado al portal de MINSA Digital, sin base de datos |
| `##### Completo: variables opcionales` | Base de datos, incidencias (RENIEC), páginas del Chat-bot y bandeja web (`SANDBOX_PAGE_ENABLED`), logs, perímetro, candado y `HOST_PORT` | Todo lo demás: Vercel o desarrollo local con base de datos, el flujo de incidencia, ajustes finos |

La versión completa es el archivo entero; la mínima es solo el primer bloque. Ninguna variable se repite entre bloques.

> **El bloque mínimo está pensado para Docker sin base.** Para Docker con base de datos pon `DATABASE_ENABLED=true` y `DATABASE_URL` (ver [Arranque con base de datos](#arranque-con-base-de-datos)). Si copias el archivo para **Vercel o desarrollo local**, deja `DATABASE_ENABLED` vacía (con `false` no hay bandeja web ni historial) y pon `SANDBOX_ENABLED=false` en Production (el Chat-bot no tiene autenticación).

- **Sin el bloque completo, la incidencia no funciona:** con `INCIDENCIAS_ENABLED=true` el menú la ofrece, pero sin `RENIEC_LOOKUP_BASE_URL` y `SANDBOX_USE_REAL_RENIEC=true` solo acepta el DNI de prueba, y **sin base de datos (`DATABASE_ENABLED=false`) la incidencia no se puede guardar**: el bot responde que no pudo registrarlo.
- **Registrar y consultar una incidencia están apagadas por defecto:** sin `INCIDENCIAS_ENABLED=true` el menú solo ofrece **Agendar una cita médica**, y ni el código `MINSA-AAAA-NNNNNN`, ni las palabras clave, ni el `2` o `3` escritos (en el Chat-bot, el `3` o `4`), ni una sesión que quedó a medias en uno de esos flujos llegan a ellos: el bot responde que por ahora solo agenda citas y muestra el menú.
- **Nunca subas valores reales** a `.env.example`: el archivo se versiona.
- **En Vercel** se cargan una por una en *Project → Settings → Environment Variables*, sin comentarios ni espacios alrededor del valor.
- **Una variable vacía equivale a no definirla:** se usa el valor por defecto indicado.
- `tests/integration/env-example.test.ts` falla si `.env.example` lista una variable que el código no lee, si le falta una que sí lee, o si alguna no está documentada aquí.

**WhatsApp Cloud API (obligatorias)**

| Variable | Uso |
|---|---|
| `META_APP_SECRET` | Secreto de la app: valida la firma HMAC (`X-Hub-Signature-256`) de cada webhook |
| `META_WEBHOOK_VERIFY_TOKEN` | Token que eliges tú; Meta lo envía en el `GET` de verificación del webhook |
| `META_ACCESS_TOKEN` | Token de acceso: envía los mensajes |
| `META_PHONE_NUMBER_ID` | ID del número de WhatsApp desde el que responde el bot |
| `META_GRAPH_API_VERSION` | Versión de Graph API, sin espacios (por defecto `v21.0`) |

**Persistencia**

| Variable | Uso |
|---|---|
| `DATABASE_ENABLED` | `false` = sin base de datos (servidor MINSA). Vacía = con base de datos (Vercel). Ver [Modos de persistencia](#modos-de-persistencia) |
| `DATABASE_URL` | Cadena de conexión a PostgreSQL. Con base de datos también se necesita al compilar, porque `npm run build` ejecuta `prisma migrate deploy`. No hace falta con `DATABASE_ENABLED=false` |
| `RESET_DATABASE_CONFIRM` | **Destructiva, solo Docker.** Si vale lo mismo que el nombre de la base de `DATABASE_URL`, el arranque borra los esquemas y migra desde cero. Úsala una sola vez y quítala después. Ver [Borrar la base y migrar desde cero](#borrar-la-base-y-migrar-desde-cero) |
| `HOST_PORT` | Solo Docker Compose: puerto publicado en el servidor (por defecto `3000`) |

**MINSA y RENIEC** (en `false`, el bot usa datos de prueba fijos)

| Variable | Uso |
|---|---|
| `SANDBOX_USE_REAL_MINSA` | `true`: MINSA real (identidad, catálogo, agendamiento). **La lee también el webhook real, no solo el Chat-bot** |
| `CITA_ALLOWED_DEPARTAMENTOS` | Departamentos donde se agenda por este canal (alcance del piloto), separados por comas: `LIMA`, `LIMA,CALLAO`… Un distrito fuera de la lista recibe el enlace a MINSA Digital; aplica también al modo manual (departamento → provincia → distrito). **Vacía o sin definir = sin filtro (todo el Perú).** En Vercel hay que definirla de forma explícita (por ejemplo `CITA_ALLOWED_DEPARTAMENTOS=LIMA`): sin ella el filtro queda desactivado |
| `MINSA_API_HOST` | Host de la API del MINSA |
| `MINSA_INTEGRATION_SECRET` | Secreto con el que se firma la petición de identidad (documento y OTP) |
| `MINSA_CONVERSATION_ID_PLACEHOLDER` | ID de conversación que el MINSA exige en la petición de identidad |
| `MINSA_DIGITAL_APP_URL` | **Obligatoria en el servidor real.** URL pública del portal de MINSA Digital, sin valor por defecto en el código: de ella salen los botones hacia el portal (**Continuar mi cita**, **Ir a MINSADIGITAL**, **Cita Nivel Global** y **Ver mi cita**) y las cabeceras `Origin` y `Referer` de las llamadas autenticadas al MINSA (se toma el origen: esquema, dominio y puerto). Si cambia el dominio, solo se cambia esta variable. `docker-compose.yml` la exige: el servidor no arranca sin ella, con un mensaje que la nombra. Si aun así falta, la bienvenida de whatsapp-bot muestra el menú, los demás avisos salen como texto sin enlace y `/api/health` responde `degraded` con el código `MINSA_DIGITAL_APP_URL_MISSING` (se registra como `error` con el MINSA real y como `warn` con el simulado). Con el MINSA real, las llamadas autenticadas no salen sin `Origin` ni `Referer`: se cortan con un 503 sin cuerpo, se registra `minsa.request_blocked` y quien llamó lo trata como un error del MINSA |
| `SANDBOX_USE_REAL_RENIEC` | `true`: RENIEC real. `false`: solo el DNI de prueba `12345678` |
| `INCIDENCIAS_ENABLED` | `true` (sin distinguir mayúsculas ni espacios) ofrece **Registrar una incidencia** y **Consultar una incidencia** en el menú (whatsapp-bot y Chat-bot). Apagada por defecto: sin definir, vacía o con cualquier otro valor, solo queda **Agendar una cita médica**. Se lee en cada mensaje: cambiarla no exige recompilar, solo reiniciar el proceso |
| `RENIEC_LOOKUP_BASE_URL` | Servicio que valida el DNI y devuelve el nombre |

**Imágenes de la incidencia** (el flujo de incidencia **ya no guarda imágenes ni archivos**: si la persona envía una imagen o un PDF, el bot lo reconoce, no lo descarga y sigue; estas variables solo las usa el servicio de registro si algún día se le entrega una imagen)

| Variable | Uso |
|---|---|
| `MEDIA_STORAGE_BASE_URL` | URL del servicio de imágenes. El bot le hace `POST` con los bytes de la foto (cabecera `Content-Type` con su tipo) y espera `{ "ruta": "..." }`; esa ruta es lo que se guarda como evidencia. Contrato a confirmar con OGTI |
| `MEDIA_STORAGE_TOKEN` | Credencial del servicio, si la pide: se envía como `Authorization: Bearer`. Vacía = sin cabecera |
| `MEDIA_STORAGE_TIMEOUT_MS` | Tiempo máximo de la subida, en milisegundos (por defecto `10000`). Si vence, la incidencia no se guarda y el ciudadano puede reintentar |

**IA** (ver [Cambiar de proveedor de IA](#cambiar-de-proveedor-de-ia))

| Variable | Uso |
|---|---|
| `SANDBOX_USE_REAL_AI` | `true`: IA real (intención del mensaje libre, distrito, fecha y pistas). `false`: diccionario de prueba, sin costo |
| `AI_PROVIDER` | Proveedor de IA; va en el bloque mínimo junto a las credenciales de ese proveedor. Vacía o `gemini`: Gemini (hoy el único). Un valor desconocido apaga la IA real (respaldo fijo), se registra al arrancar como `config.invalid` (`AI_PROVIDER_UNKNOWN`) y `/api/health` responde `degraded` |
| `GOOGLE_CLIENT_API` | API key de Google AI. Viaja en la cabecera `x-goog-api-key`, nunca en la URL. Vacía o inválida: Gemini falla y el mensaje libre vuelve al menú (log `ai.fallback`) |
| `GOOGLE_AI_MODEL` | Modelo de Gemini (por defecto `gemini-3.6-flash`). Un nombre que no existe da HTTP 404 |

**Chat-bot** (variables `SANDBOX_*`)

| Variable | Uso |
|---|---|
| `SANDBOX_ENABLED` | `true` habilita `POST /api/sandbox`, que **no tiene autenticación** (404 si no). Con las variables `SANDBOX_USE_REAL_*` en `true` llama a servicios reales: úsalo solo en local y Preview, nunca en Production |
| `SANDBOX_PAGE_ENABLED` | `true` muestra las páginas del Chat-bot (`/sandbox` y `/configuracion-visor-sandbox`), deja que `/` redirija a `/sandbox` y **abre la bandeja web** (`/api/conversations*` y `/api/messages/send`). Sin definir o con cualquier otro valor: las tres páginas redirigen a `/api/health` y esas cuatro rutas responden `404`, aunque la base esté activa. **No afecta a `POST /api/sandbox`**, que sigue gobernada por `SANDBOX_ENABLED` (el portal de MINSA Digital la usa). La bandeja web **no tiene autenticación**: lista todas las conversaciones con su teléfono y permite escribir desde el número oficial. En Production déjala sin definir |
| `SANDBOX_ALLOWED_ORIGINS` | Orígenes permitidos (CORS, separados por comas) para el Chat-bot en otro frontend. Una barra final se ignora. Ver [Conectar un frontend externo](#conectar-un-frontend-externo-chat-bot) |

**Logs** (ver [docs/observabilidad.md](docs/observabilidad.md))

| Variable | Uso |
|---|---|
| `LOG_LEVEL` | Nivel mínimo: `info` (por defecto), `warn`, `error` o `silent` |
| `LOG_TO_FILE` | `true` escribe también en `logs/DD-MM-AAAA/app.ndjson` y `alerts.ndjson`. Solo local: en Vercel el disco es de solo lectura y los logs van a Vercel Logs. En Docker los archivos quedan dentro del contenedor y se pierden al recrearlo, así que usa `npm run docker:logs` |
| `LOG_DIR` | Carpeta de los logs en archivo (por defecto `logs`) |

**Perímetro y candado de turno** (opcionales: define alguna solo para cambiar su valor por defecto)

| Variable | Uso |
|---|---|
| `INBOUND_RATE_LIMIT` | `off` desactiva el límite de mensajes entrantes (más de 20 en 60 s bloquea al número por 1 hora); solo para depurar en local |
| `TURN_PROCESS_LOCK_TIMEOUT_MS` | Espera máxima en la cola en memoria del proceso (por defecto `30000`) |
| `TURN_LOCK_TIMEOUT_MS` | `lock_timeout` del candado en Postgres (por defecto `10000`) |
| `TURN_LOCK_MAX_CONCURRENCY` | Turnos con candado de Postgres a la vez por instancia (por defecto `4`) |
| `TURN_DB_LOCK` | `off` desactiva el candado de Postgres y deja solo el de memoria |

## Estructura del proyecto

```
app/                         rutas de Next.js (delgadas): bandeja web, /api/*, /webhook/whatsapp, páginas del Chat-bot
  components/                UI de la bandeja y del Chat-bot; Sandbox.tsx es el contenedor del chat
    sandbox-chat/            piezas de presentación del chat (cabecera, composer, burbujas, tarjeta de DNI, panel de depuración)
    ui/                      componentes de UI compartidos (Button es el único botón nativo; IconButton, ListPicker, TextInput, Banner, Card, Badge)
    icons/                   todos los íconos SVG de la app, centralizados
lib/
  enums/                     enums reales para estados y tipos que antes eran texto suelto (SendType, ApiErrorCode)
  constants/regex/           todas las expresiones regulares del proyecto, como constantes con nombre, un archivo por dominio
  constants/textos/          todos los textos, botones y filas que recibe el ciudadano, un archivo por flujo
  constants/prompts/         los prompts de las tareas de IA, un archivo por tarea
  constants/palabras-clave.ts  palabras y frases que escribe el ciudadano y que el bot reconoce
  utils/                     funciones puras que no dependen de React ni del render
  errors/                    clases de error propias, una por archivo (UnknownStateError, TurnLockTimeoutError)
  establecimientos/          padrón de establecimientos: búsqueda, decisión y repositorio
  inbox/                     bandeja web: control de acceso, DTO y repositorio
  recepcion/                 registro y consulta de incidencias: servicio, repositorio, DTO y almacén de imágenes
  services/                  catálogo de servicios del menú (cita, referencia, incidencia, consulta): BotService y ServiceCatalog
  time/                      reloj en hora de Lima
  db/                        cliente Prisma (carga diferida) y el flag DATABASE_ENABLED
  whatsapp/                  envío de mensajes y descarga de media (Meta Cloud API)
    webhook/                 pipeline de entrada: mapeo del payload, guardado + candado de turno, respuesta al ciudadano,
                             control de reentregas en memoria (modo sin base de datos)
  integrations/              clientes HTTP de servicios externos: RENIEC
    minsa/                   cliente del MINSA separado por endpoint: identidad, catálogo, reserva (+ wire, formato, fakes)
  config/                    catálogo de errores de configuración y su revisión al arrancar
  http/                      formato único de error de la API (apiError)
  observability/             logger estructurado, catálogo de eventos (events.ts), tracer, enmascarado, logs en archivo
  security/                  perímetro del webhook: filtro de payload, rate limiter, guardia léxica
  fsm/                       la máquina de estados de la conversación
    core/                    motor: tipos de sesión, ejecutor, despachador de turnos (handle)
    session/                 persistencia de sesión (base de datos o memoria), expiración, reverificación,
                             candado de turno por ciudadano
    routing/                 primer contacto, bienvenida, menú principal, enrutamiento de la guardia léxica, entrada a un flujo
    parsing/                 lectura del texto del ciudadano, agrupada por tipo de dato
      date/                  fechas y horas escritas en texto libre
      text/                  normalización, detección de ruido/gibberish, formato de identidad
      selection/             elección de opciones de lista, confirmaciones sí/no, intención de salida
      ai/                    interpretación asistida por IA, un módulo por tarea (distrito, intención del menú, fecha, pistas);
                             llm.ts es el puerto, llm-registry.ts elige el proveedor
        providers/           un adaptador por proveedor de IA (hoy gemini.ts)
    flows/
      cita/                  flujo de cita: handlers-cita.ts enruta cada estado a steps/
        data/                catálogos y datos estáticos propios del flujo (nombres de especialidad, ubigeo)
        parsing/             resolución de texto libre propia del flujo (distrito, selección de opciones, pistas)
        steps/               un módulo por paso de la conversación, agrupado por responsabilidad:
          identity/          DNI, OTP, reverificación
          catalog/           establecimientos y especialidades
          fecha/             fecha de la cita
          ubigeo/            departamento/provincia/distrito manual
          booking/           reserva, duplicados, selección de referencias médicas
          exit/              salida/cancelación del flujo
          hora/              el paso de hora: lista, horas escritas, elección «1»..«10», confirmación
          demo/              flujo hardcodeado para el piloto comercial; borrar junto con su importador al cerrarlo
      incidencia/            flujo de incidencia
      consulta/              consulta de una incidencia por su código
      referencia/            servicio Consultar referencia: entrada, consulta por documento y oferta de cita cuando no hay referencias
      emergency/             corte por urgencia
      out-of-scope/          detección de consultas fuera de alcance y los canales oficiales a los que deriva
tests/
  lib/                       espejo exacto de lib/: cada x.ts de lib/ tiene su x.test.ts en la misma ruta bajo tests/lib/
  security/, stress/, integration/, smoke/ (PostgreSQL real), support/   suites transversales, no colocalizadas
data/                        datos estáticos (distritos del Perú)
prisma/                      esquema y migraciones
scripts/  docs/              herramientas y documentación del proyecto
```

Convenciones (ESLint las hace cumplir donde se indica):

| Regla | Detalle |
|---|---|
| **Imports siempre con el alias `@/`** | Los imports relativos se rechazan (`no-restricted-imports`). |
| **Sin ciclos de imports** | `import/no-cycle`; solo se permiten ciclos a través de un `import()` diferido. |
| **Tests en estructura espejo, no colocalizados** | `lib/<ruta>/x.ts` tiene su test en `tests/lib/<la-misma-ruta>/x.test.ts`. Los tests de escenario de un flujo van en la misma ruta espejo (por ejemplo, `tests/lib/fsm/flows/cita/hora-choice.test.ts`). El alias `@/` resuelve igual sin importar dónde viva el test, así que nunca hace falta un import relativo (`../../`). |
| **Organización por flujo, no por capa** | Un error en un paso de la conversación vive en `lib/fsm/flows/<flujo>/`. |
| **Comentarios** | El código, las migraciones y las pruebas SQL no llevan comentarios ni docstrings: la intención va en los nombres y la explicación en este README y en `docs/`. La única excepción son las directivas que necesita una herramienta (por ejemplo `eslint-disable`). |
| **Formato único con Prettier** | Líneas de hasta 140 caracteres, dos espacios, comillas dobles, punto y coma y coma final (`.prettierrc.json`). `npm run format` lo aplica y el CI lo exige con `npm run format:check`. Por ahora cubre `lib/`, `tests/`, `scripts/` y los archivos de configuración de la raíz; `app/` y `tests/app/` todavía no se formatean (`.prettierignore`). |
| **Estados y tipos como enums** | Los textos fijos que representan un estado o un tipo (`SendType`, `ApiErrorCode`) son un `enum` en `lib/enums/`, nunca un string suelto comparado a mano. |
| **Textos y prompts en un solo lugar** | Los textos al ciudadano (constantes `*_TEXT`, botones `*_BUTTONS` y funciones cuando el texto lleva datos) viven en `lib/constants/textos/`, y los prompts de IA en `lib/constants/prompts/`, sin archivo índice. Un texto repetido es una sola constante. `tests/integration/textos-location.test.ts` lo hace cumplir. |
| **Expresiones regulares en un solo lugar** | Viven en `lib/constants/regex/` como constantes con nombre, sin archivo índice: se importa el archivo del dominio. `tests/integration/regex-location.test.ts` lo hace cumplir. |
| **Sin valores arbitrarios de Tailwind** | Nada de `bg-[var(--x)]`, `bg-[#hex]` ni `text-[10px]`. Los colores y tamaños se declaran como tokens en `@theme` (`app/globals.css`, Tailwind v4) y se usan con clases estándar. `tests/integration/ui-design-rules.test.ts` lo hace cumplir. |
| **Sin emojis en las vistas** | Se reemplazan por un ícono de `app/components/icons/`. El mismo test de arriba los detecta. |
| **UI repetida → componente** | Un bloque de clases de Tailwind que se repite en más de un lugar se extrae a `app/components/ui/`. |
| **Lógica pura fuera de la vista** | Una función sin hooks de React (cálculo, formato, parseo) vive en `lib/utils/`, con su test. |

### Cambiar de proveedor de IA

Las tareas de IA no conocen al proveedor: piden un JSON a un `LlmClient` (`lib/fsm/parsing/ai/llm.ts`) con un JSON Schema estándar, y `getLlmClient()` (`llm-registry.ts`) decide cuál se usa según `AI_PROVIDER`.

| Paso | Qué hacer |
|---|---|
| 1. Adaptador | Crear `lib/fsm/parsing/ai/providers/<proveedor>.ts` que implemente `LlmClient.generateJson`: traducir el JSON Schema al formato del proveedor, hacer la petición con `timedFetch` y devolver `LlmJsonOutcome` (los mismos 4 tipos de falla que Gemini) |
| 2. Registro | Sumar el proveedor a `LlmProvider` (`llm.ts`) y a `PROVIDERS` (`llm-registry.ts`) |
| 3. Configuración | Definir `AI_PROVIDER=<proveedor>` y su API key, y documentar la variable nueva aquí y en `.env.example` |
| 4. Tests | Probar el adaptador con `fetch` simulado, como `providers/gemini.test.ts`; las tareas ya se prueban con un `LlmClient` falso |

Las tareas, los prompts y el FSM no cambian.

### Manejo de errores

El bot es *fail-open*: una falla externa (MINSA, RENIEC, Gemini, WhatsApp) nunca deja al ciudadano sin respuesta; se convierte en un respaldo o en un texto fijo y queda registrada. Cada tipo de error tiene un único catálogo:

| Qué | Catálogo | Regla |
|---|---|---|
| Eventos de log | `lib/observability/events.ts` (`LogEvent`, `TurnNoteKind`) | TypeScript rechaza un nombre que no esté en el catálogo; un test exige que cada evento figure en `docs/observabilidad.md`. Nada del servidor escribe en la consola directamente |
| Configuración | `lib/config/config-errors.ts` (`CONFIG_ERRORS`) | `instrumentation.ts` revisa la configuración al arrancar y registra cada problema como `config.invalid`; `/api/health` pasa a `degraded`. El bot no se detiene |
| Textos al ciudadano | `lib/constants/textos/fallas.ts` | Los textos de falla viven en un solo lugar; un test de oro los fija byte a byte |
| Respuestas HTTP | `lib/http/api-error.ts` (`API_ERRORS`, `apiError`) | Toda respuesta de error es `{ error: CÓDIGO, message }` (más `detail` opcional), con el status del catálogo y el mensaje en español. Los `403` del webhook siguen en texto plano porque Meta no lee el cuerpo |
| Excepciones | `lib/errors/` (una clase por archivo, sin archivo índice) | Nada en `lib/` ni en `app/` lanza un `Error` genérico: cada falla tiene su clase, que arma el mensaje a partir de sus datos y los expone como campos de solo lectura. Quien la atrapa la reconoce con `instanceof`, nunca por el texto del mensaje. `tests/integration/errores-location.test.ts` lo hace cumplir |

| Clase | Cuándo se lanza |
|---|---|
| `UnknownStateError` | La sesión está en un estado que ningún flujo atiende |
| `UnhandledQueryKindError` | El ejecutor recibe una consulta que no sabe resolver |
| `MultipleQueryEffectsError` | Un paso devuelve más de una consulta en la misma pasada |
| `MaxPassesExceededError` | Un turno supera el tope de pasadas del ejecutor |
| `DatabaseDisabledError` | Se usa Prisma con la base de datos apagada |
| `ImageStorageError` | El servicio de imágenes responde con error o sin ruta |
| `TurnLockTimeoutError` | Se agota la espera del candado de turno; el Chat-bot responde `BUSY` y el webhook registra `turn.lock_timeout` |

Un resultado esperado (por ejemplo, una reserva rechazada) no es una excepción: la función devuelve su estado como enum.

Para agregar un error nuevo: sumar su entrada al catálogo que corresponde, o su clase a `lib/errors/` con su test, y usarlo desde ahí; nunca un string suelto.

## Pruebas

| Comando | Qué corre |
|---|---|
| `npm test` | Suite completa (unitarias, escenarios, seguridad, estrés) con almacenes en memoria y fakes; no necesita secretos ni base de datos, y fija `DATABASE_URL` vacío aunque el runner exporte uno (GitLab Auto DevOps lo hace) |
| `npm run test:perf` | Pruebas de rendimiento (latencia P99, heap, ReDoS). Corren solas, porque en paralelo con la suite sus límites de tiempo fallan sin motivo real |
| `npm run test:gaps` | La suite en modo estricto para las brechas conocidas (`tests/support/known-gap.ts`) |
| `npm run smoke:postgres` | Pruebas de humo contra una base PostgreSQL real (hay que definir `DATABASE_URL` y `DATABASE_ENABLED=true`) |
| `npm run db:test` | Arma una base desechable solo con las migraciones y corre las pruebas SQL de `prisma/tests/` (necesita `psql` y un `DATABASE_URL`) |
| `npm run db:diccionario` | Regenera el diccionario de datos de la base desde una base ya migrada |
| `npm run format` | Aplica el formato de Prettier al código |
| `npm run format:check` | Verifica el formato sin modificar archivos; es lo que corre el CI |

El CI (GitHub Actions) ejecuta tipos, lint, formato, `npm test` y `test:perf` en cada pull request. Ver [docs/ci.md](docs/ci.md).

## Despliegue en Vercel (con base de datos)

En Vercel se necesitan `DATABASE_URL` y las variables de Meta. El script `build` ejecuta `prisma migrate deploy` antes de `next build`, así que las migraciones pendientes se aplican en cada despliegue:

```json
"build": "prisma migrate deploy && next build --webpack"
```

- `--webpack` fuerza el compilador clásico en lugar de Turbopack, cuyo build de producción fallaba al prerenderizar `_global-error` en esta versión de Next.js.
- Correr las migraciones dentro del build es un enfoque simple, suficiente para la escala actual. Conviene revisarlo si el equipo crece o si las migraciones se vuelven riesgosas de ejecutar sin supervisión.
- `next.config.ts` solo activa la salida *standalone* cuando `NEXT_OUTPUT_STANDALONE=true` (lo hace el Dockerfile), así que los builds de Vercel no cambian.

## Chat-bot: página de pruebas de los flujos

Junto a la bandeja real, `/` tiene una pestaña con el Chat-bot (en la interfaz aún se rotula «Sandbox»): un simulador de conversación para los flujos de cita médica, referencia e incidencia, escribiendo mensajes directamente, sin pasar por WhatsApp. Usa la misma máquina de estados (`lib/fsm/`) y nunca toca las conversaciones reales.

- Está **desactivado por defecto** (`SANDBOX_ENABLED=false`) porque la aplicación no tiene autenticación propia: cualquiera que abra la URL pública lo vería. Las páginas se controlan aparte con `SANDBOX_PAGE_ENABLED=true` (local y Vercel); sin ella, `/`, `/sandbox` y `/configuracion-visor-sandbox` redirigen a `/api/health`.
- **Al abrir o recargar el Chat-bot no se restaura la conversación anterior:** el navegador avisa con `POST /api/sandbox` y `close: true` (responde `200 { "closed": true }` sin ejecutar ningún turno), la sesión anterior se cierra y empieza una nueva. En la base, la fila anterior queda como registro cerrado: su `wa_id` pasa a `cerrada-<from anterior>-<marca de tiempo>` y conserva `estado`, `slots` y `contadores`; `fecha_modificacion` pasa a ser la fecha de cierre (un disparador de la base la actualiza en cada cambio). **Reiniciar todas las pruebas** (`resetAll`) solo borra las sesiones `sandbox-…`, no las cerradas. Ojo: `chatbot.purgar_sesiones_inactivas` borra cualquier sesión inactiva, también las cerradas, si se programa; para auditarlas hay que excluir los `wa_id` que empiezan con `cerrada-`. Sin base de datos viven en memoria y vencen con el mismo plazo que el resto.
- **El token de MINSA nunca sale del servidor.** `POST /api/sandbox` responde `{ sent, session: { state, slots, counters } }` y `slots` es una lista blanca (`lib/constants/sandbox-visible-slots.ts`, armada por `buildSandboxReply` en `lib/utils/sandbox-reply.ts`): el token (`citaBearer`), los identificadores del código OTP, los documentos, los nombres, los textos libres, los datos de referencias y de consultas no viajan al navegador. El navegador solo guarda `sandbox-from` en `localStorage`, con la forma `sandbox-<UUID v4>` (`crypto.randomUUID()`, o `crypto.getRandomValues` donde la página no es un contexto seguro; nunca `Math.random`): es la única identidad de la sesión del Chat-bot y no debe poder adivinarse. Siguiente paso, aún sin hacer: que el servidor la emita en una cookie `httpOnly` en lugar de `localStorage`; las claves antiguas `sandbox-session` y `sandbox-entries` se borran al abrir el Chat-bot. Una prueba falla si aparece un slot sin clasificar como visible o retirado.
- Con las integraciones en su valor por defecto (`false`), funciona sin conexión con datos de prueba fijos: DNI `12345678` (8 dígitos) o carnet de extranjería `123456789` (9 dígitos), OTP `1234`, distrito `lurigancho`. El bot pide solo el número de documento y el largo decide el tipo (`01` DNI, `03` carnet de extranjería), que viaja como `tipo_documento` a MINSA.
- Las referencias médicas son un servicio propio, **Consultar referencia** (fila del Chat-bot, o escribir «referencia» en el Chat-bot y en whatsapp-bot; ver [docs/flujo-referencias.md](docs/flujo-referencias.md)). Sin `SANDBOX_USE_REAL_MINSA=true` la consulta responde siempre «No cuentas con referencias registradas.» y ofrece agendar una cita. La excepción son los DNI `10308523` y `47391441` del piloto comercial: solo bajo ese servicio, tras iniciar sesión con ellos, se muestran referencias de demostración (`lib/fsm/flows/cita/steps/demo/`) en lugar de consultar MINSA; el inicio de sesión es el normal, así que necesitan un MINSA que los valide. En la cita esos documentos siguen el camino normal. La reserva con una referencia real se recorre contra el MINSA real o en `tests/lib/fsm/core/referencia-flow.e2e.test.ts`, que inyecta las referencias.
- **Contrato de `/whatsapp/api/v1/references`** (`lib/integrations/minsa/references.ts` es el único punto que lo lee). El backend envía el sobre `{ "status_reference": "found" | "empty", "message": "...", "data": [filas] }` y el bot lo usa tal cual: no deduce el estado de las filas ni filtra referencias por su estado; esa lógica es del backend. Hacia adentro el resultado es `{ statusReference, message, data }`, con `data` como arreglo vacío o lleno. Una respuesta sin `status_reference`, con un valor desconocido, un cuerpo ilegible o un HTTP que no es 2xx llega como `statusReference: "error"`. Cada fila exige `id_referencia` y `estado.codigo`; las que no los traen se descartan y se registran en `minsa.catalog.rows_discarded`. Solo con `found` se listan las referencias; en cualquier otro caso el bot responde «No cuentas con referencias registradas.» y pregunta si quiere agendar una cita.

## Consultar una incidencia

La persona puede ver el estado de una incidencia con su código (`MINSA-AAAA-NNNNNN`, el que recibe al registrarla): con la opción **Consultar una incidencia** del menú (o escribiendo `3` en whatsapp-bot o `4` en el Chat-bot; solo con `INCIDENCIAS_ENABLED=true`, si no el menú no la muestra y el código tampoco la abre), o escribiendo el código dentro de cualquier mensaje («quiero ver mi incidencia MINSA-2026-000003»). Solo cuenta el formato completo; `lib/fsm/parsing/text/codigo-incidencia.ts` lo reconoce. El flujo vive en `lib/fsm/flows/consulta/` y la lectura en `lib/recepcion/consulta.ts` (solo lectura, una consulta).

- **Quién puede verla (el código solo funciona para quien la registró).**
  - **whatsapp-bot:** se busca al usuario por su identificador actual (`usuario.wa_id`, el BSUID de Meta) y la incidencia debe ser de ese usuario (`usuario_id`), no de otro. El identificador lo pone el servidor, nunca el texto del mensaje. Sirve también para las incidencias anónimas.
  - **Chat-bot:** la identidad es el documento verificado con DNI + código OTP de MINSA Digital (los mismos pasos que la cita) y debe coincidir con el `dni_reclamante`. Las anónimas no se pueden consultar por el Chat-bot. El canal lo fija el servidor (`channel` del evento); el cliente no lo elige.
  - **JWT del portal: pendiente.** Cuando MINSA Digital entregue la especificación de su JWT (algoritmo y clave pública o JWKS, emisor, vencimiento y el campo con el documento), se reemplazará el paso DNI + OTP por validar el token. Hoy no hay código para eso: el flujo vive en `lib/fsm/flows/consulta/handlers-consulta.ts`.
- **Qué responde.** Código, estado en palabras (recibida, derivada al área responsable, en atención, resuelta, archivada) y fecha de registro. Nunca la descripción ni datos de quien reportó. Inexistente, ajena, anónima (en la web) o borrada reciben exactamente el mismo texto: «No se logró ubicar el registro de la incidencia.» Base apagada o caída: «Disculpa, no podemos consultar tu incidencia en este momento. Inténtalo más tarde.» En todos los casos la sesión termina y el siguiente mensaje empieza de nuevo.
- **Cambio de identificador de Meta.** Si la persona cambia de número, Meta cambia su BSUID y avisa con el webhook `user_id_update` (campo aparte que hay que suscribir) y un mensaje de sistema. El bot renombra `usuario.wa_id` y su sesión al identificador nuevo (`lib/whatsapp/webhook/user-id-update.ts`), así sus incidencias lo siguen. Limitaciones: si el identificador nuevo ya tenía usuario propio **no se fusionan** (se avisa en el log y la persona no verá las incidencias anteriores); `incidencia_paciente.wa_id` conserva el identificador de cuando se registró y el tope diario cuenta por él.

## Notas técnicas

- **Webhook en runtime Node.js.** `app/webhook/whatsapp/route.ts` no corre en Edge porque la verificación de la firma necesita el módulo `crypto` de Node. La ruta está fija en `/webhook/whatsapp` para coincidir con la URL de callback registrada en Meta for Developers.
- **Ventana de atención de 24 horas.** Se calcula desde el **último mensaje entrante** de la conversación, no desde la actividad general.
- **Identificadores BSUID.** Los contactos de esta cuenta usan el esquema *Business-Scoped User ID* de Meta. Los webhooks traen `user_id`/`from_user_id` en lugar de `wa_id`/`from`, y los envíos deben usar `recipient` (con `recipient_type: "individual"`) en lugar de `to`: con `to`, Graph API acepta la petición pero el mensaje nunca se entrega.
- **Sin autenticación.** La aplicación no incluye login; por eso el Chat-bot está desactivado por defecto.
- **Carga diferida de Prisma.** `@prisma/client` lee el `.env` al cargarse; por eso el ejecutor importa `lib/recepcion/servicio` de forma diferida y no se carga en los turnos que no tocan la base.

## Documentación relacionada

| Documento | Contenido |
|---|---|
| [docs/flujo-cita.md](docs/flujo-cita.md) | Árbol del flujo de cita: listas, botones, texto libre que entiende cada paso y todas las ramas de error |
| [docs/flujo-referencias.md](docs/flujo-referencias.md) | Servicio Consultar referencia: entradas por canal, numeración del menú, pasos, sin referencias y sesión vencida |
| [docs/flujo-incidencia.md](docs/flujo-incidencia.md) | Flujo de incidencia: entradas, pasos, cancelar y límites |
| [docs/despliegue-minsa.md](docs/despliegue-minsa.md) | Requisitos de la base, variables nuevas, despliegue y comprobaciones para infraestructura de MINSA |
| [docs/ci.md](docs/ci.md) | Qué comprueba el CI y la regla de la rama `main` |
| [docs/observabilidad.md](docs/observabilidad.md) | Logs estructurados, trazas y enmascarado |
| [docs/brechas-tecnicas.md](docs/brechas-tecnicas.md) | Brechas técnicas que siguen abiertas |
| [docs/canales-fuera-de-alcance.md](docs/canales-fuera-de-alcance.md) | Canales oficiales de derivación pendientes de confirmar |
| [docs/qa/guia-pruebas-manuales.md](docs/qa/guia-pruebas-manuales.md) | Casos de prueba manual |
