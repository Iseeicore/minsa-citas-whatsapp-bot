# Bot de citas MINSA por WhatsApp

Bot de WhatsApp (WhatsApp Business Cloud API) que atiende a la ciudadanía: agenda citas médicas en el MINSA, registra reclamos, deriva urgencias y consultas fuera de alcance a los canales oficiales. Está construido con Next.js (App Router) y puede correr de dos formas: **con base de datos** (Vercel + PostgreSQL, con bandeja web de conversaciones) o **sin base de datos** (servidor del MINSA en Docker, solo responde mensajes y no guarda nada).

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

1. Copia `.env.example` a `.env` (ignorado por git) junto a `docker-compose.yml` y completa, como mínimo, el bloque **`##### Mínimo`**: Meta, MINSA, Gemini, el Sandbox para el frontend conectado y `DATABASE_ENABLED=false` (ver [Variables de entorno](#variables-de-entorno)).
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
- **Variables:** `docker-compose.yml` pasa al contenedor **todas** las variables del `.env` (`env_file`). Solo fija tres, que ganan sobre `env_file`: `NODE_ENV=production`, `PORT=3000` y `HOSTNAME=0.0.0.0`, para que un valor olvidado en el `.env` no saque al servidor del puerto que usan el mapeo y el healthcheck. Las 4 credenciales de Meta son obligatorias.
- **Base de datos:** `DATABASE_ENABLED` vale `false` si no se define. La imagen se compila sin base, pero **al arrancar el contenedor aplica solo las migraciones pendientes** (ver [Arranque con base de datos](#arranque-con-base-de-datos)): no hay un paso aparte para infraestructura.
- **Salud:** el `start_period` del healthcheck es de 60 s para dar tiempo a la primera migración. El compose no define un servicio de base de datos: con `DATABASE_ENABLED=true`, Prisma usa el PostgreSQL de `DATABASE_URL`.
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

### Conectar un frontend externo (widget del Sandbox)

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

4. Levanta el servidor de desarrollo:

   ```bash
   npm run dev
   ```

## Modos de persistencia

La variable `DATABASE_ENABLED` decide si el bot usa base de datos. Solo el valor exacto `false` la desactiva; vacía o con cualquier otro valor, la base de datos sigue activa.

| Aspecto | Con base de datos (por defecto, Vercel) | Sin base de datos (`DATABASE_ENABLED=false`, Docker) |
|---|---|---|
| ORM (Prisma) | Conectado a PostgreSQL | Nunca se instancia ni abre conexión; `DATABASE_URL` puede faltar |
| Estado de cada conversación | Tabla `chatbot.sesion_conversacion` | En memoria; se descarta tras 1 h sin actividad (6 × el timeout de sesión de 10 min, para que el aviso de «tu sesión expiró» siga funcionando) |
| Reentregas de Meta (no responder dos veces) | Índice único `wa_message_id` | Lista en memoria de ids de mensaje, conservada 24 h |
| Usuarios, historial de mensajes y estados de entrega | Tablas `chatbot.usuario` y `chatbot.mensaje` | No se guarda nada |
| Reclamos (incidencias) y sus fotos | Tablas `chatbot.incidencia_paciente` y `chatbot.evidencia`, con historial de cambios | **No se pueden guardar**: el bot responde que no pudo registrar el reclamo |
| Bandeja web (`/api/conversations*`, `/api/messages/send`) | Disponible | Responde `503` con `{"error":"PERSISTENCE_DISABLED","message":"…"}` |
| Candado de turno por ciudadano | Postgres (advisory lock) | En memoria, aunque exista `DATABASE_URL` |
| Build | `npm run build` (aplica migraciones) | `npm run build:no-db` (sin migraciones) |

Escalar el modo sin base de datos a varias instancias requiere un almacén compartido externo, con expiración, detrás de `lib/fsm/session/session-store.ts` y `lib/whatsapp/webhook/inbound-dedupe.ts`. Hoy el proyecto no usa ninguno.

## Variables de entorno

`.env.example` es solo la lista de variables, sin comentarios: **esta sección es su documentación.** Cópialo a `.env` y completa los valores. Está dividido en dos bloques:

| Bloque | Qué contiene | Cuándo basta |
|---|---|---|
| `##### Mínimo: servidor MINSA en Docker (…)` | Meta (5), MINSA (6, incluye `MINSA_DIGITAL_APP_URL` y `CITA_ALLOWED_DEPARTAMENTOS=LIMA`), IA (`AI_PROVIDER=gemini` y las 3 de Gemini), Sandbox (`SANDBOX_ENABLED=true`, `SANDBOX_ALLOWED_ORIGINS`) y `DATABASE_ENABLED=false` | El servidor del MINSA en Docker: citas por WhatsApp y el frontend de MINSA Digital conectado, sin base de datos |
| `##### Completo: variables opcionales` | Base de datos, reclamos (RENIEC), logs, perímetro, candado y `HOST_PORT` | Todo lo demás: Vercel o desarrollo local con base de datos, el flujo de reclamo, ajustes finos |

La versión completa es el archivo entero; la mínima es solo el primer bloque. Ninguna variable se repite entre bloques.

> **El bloque mínimo está pensado para Docker sin base.** Para Docker con base de datos pon `DATABASE_ENABLED=true` y `DATABASE_URL` (ver [Arranque con base de datos](#arranque-con-base-de-datos)). Si copias el archivo para **Vercel o desarrollo local**, deja `DATABASE_ENABLED` vacía (con `false` no hay bandeja web ni historial) y pon `SANDBOX_ENABLED=false` en Production (el Sandbox no tiene autenticación).

- **Sin el bloque completo, el reclamo no funciona:** el menú lo sigue ofreciendo, pero sin `RENIEC_LOOKUP_BASE_URL` y `SANDBOX_USE_REAL_RENIEC=true` solo acepta el DNI de prueba, y **sin base de datos (`DATABASE_ENABLED=false`) el reclamo no se puede guardar**: el bot responde que no pudo registrarlo.
- **Nunca subas valores reales** a `.env.example`: el archivo se versiona.
- **En Vercel** se cargan una por una en *Project → Settings → Environment Variables*, sin comentarios ni espacios alrededor del valor.
- **Una variable vacía equivale a no definirla:** se usa el valor por defecto indicado.
- `tests/integration/env-example.test.ts` falla si `.env.example` lista una variable que el código no lee, si le falta una que sí lee, o si alguna no está documentada aquí.

**WhatsApp Cloud API (obligatorias)**

| Variable | Uso |
|---|---|
| `META_APP_SECRET` | Secreto de la app: valida la firma HMAC (`X-Hub-Signature-256`) de cada webhook |
| `META_WEBHOOK_VERIFY_TOKEN` | Token que eliges tú; Meta lo envía en el `GET` de verificación del webhook |
| `META_ACCESS_TOKEN` | Token de acceso: envía mensajes y descarga las fotos del Libro de Reclamaciones |
| `META_PHONE_NUMBER_ID` | ID del número de WhatsApp desde el que responde el bot |
| `META_GRAPH_API_VERSION` | Versión de Graph API, sin espacios (por defecto `v21.0`) |

**Persistencia**

| Variable | Uso |
|---|---|
| `DATABASE_ENABLED` | `false` = sin base de datos (servidor MINSA). Vacía = con base de datos (Vercel). Ver [Modos de persistencia](#modos-de-persistencia) |
| `DATABASE_URL` | Cadena de conexión a PostgreSQL. Con base de datos también se necesita al compilar, porque `npm run build` ejecuta `prisma migrate deploy`. No hace falta con `DATABASE_ENABLED=false` |
| `HOST_PORT` | Solo Docker Compose: puerto publicado en el servidor (por defecto `3000`) |

**MINSA y RENIEC** (en `false`, el bot usa datos de prueba fijos)

| Variable | Uso |
|---|---|
| `SANDBOX_USE_REAL_MINSA` | `true`: MINSA real (identidad, catálogo, agendamiento). **La lee también el webhook real, no solo el Sandbox** |
| `CITA_ALLOWED_DEPARTAMENTOS` | Departamentos donde se agenda por este canal (alcance del piloto), separados por comas: `LIMA`, `LIMA,CALLAO`… Un distrito fuera de la lista recibe el enlace a MINSA Digital; aplica también al modo manual (departamento → provincia → distrito). **Vacía o sin definir = sin filtro (todo el Perú).** ⚠️ Vercel hoy no la tiene: agrega `CITA_ALLOWED_DEPARTAMENTOS=LIMA` **antes** de desplegar este cambio, o allí se desactiva el filtro |
| `MINSA_API_HOST` | Host de la API del MINSA |
| `MINSA_INTEGRATION_SECRET` | Secreto con el que se firma la petición de identidad (documento y OTP) |
| `MINSA_CONVERSATION_ID_PLACEHOLDER` | ID de conversación que el MINSA exige en la petición de identidad |
| `MINSA_DIGITAL_APP_URL` | **Obligatoria en el servidor real.** URL pública del portal de MINSA Digital, sin valor por defecto en el código: de ella salen los botones hacia el portal (**Continuar mi cita**, **Ir a MINSADIGITAL**, **Cita Nivel Global** y **Ver mi cita**) y las cabeceras `Origin` y `Referer` de las llamadas autenticadas al MINSA (se toma el origen: esquema, dominio y puerto). Si cambia el dominio, solo se cambia esta variable. `docker-compose.yml` la exige: el servidor no arranca sin ella, con un mensaje que la nombra. Si aun así falta, la bienvenida de WhatsApp muestra el menú, los demás avisos salen como texto sin enlace y `/api/health` responde `degraded` con el código `MINSA_DIGITAL_APP_URL_MISSING` (se registra como `error` con el MINSA real y como `warn` con el simulado). Con el MINSA real, las llamadas autenticadas no salen sin `Origin` ni `Referer`: se cortan con un 503 sin cuerpo, se registra `minsa.request_blocked` y quien llamó lo trata como un error del MINSA |
| `SANDBOX_USE_REAL_RENIEC` | `true`: RENIEC real. `false`: solo el DNI de prueba `12345678` |
| `RENIEC_LOOKUP_BASE_URL` | Servicio que valida el DNI y devuelve el nombre |

**Imágenes del reclamo** (opcional: sin `MEDIA_STORAGE_BASE_URL` el bot **no pide la foto** y el reclamo se guarda sin ella)

| Variable | Uso |
|---|---|
| `MEDIA_STORAGE_BASE_URL` | URL del servicio de imágenes. El bot le hace `POST` con los bytes de la foto (cabecera `Content-Type` con su tipo) y espera `{ "ruta": "..." }`; esa ruta es lo que se guarda como evidencia. Contrato a confirmar con OGTI |
| `MEDIA_STORAGE_TOKEN` | Credencial del servicio, si la pide: se envía como `Authorization: Bearer`. Vacía = sin cabecera |
| `MEDIA_STORAGE_TIMEOUT_MS` | Tiempo máximo de la subida, en milisegundos (por defecto `10000`). Si vence, el reclamo no se guarda y el ciudadano puede reintentar |

**IA** (ver [Cambiar de proveedor de IA](#cambiar-de-proveedor-de-ia))

| Variable | Uso |
|---|---|
| `SANDBOX_USE_REAL_AI` | `true`: IA real (intención del mensaje libre, distrito, fecha y pistas). `false`: diccionario de prueba, sin costo |
| `AI_PROVIDER` | Proveedor de IA; va en el bloque mínimo junto a las credenciales de ese proveedor. Vacía o `gemini`: Gemini (hoy el único). Un valor desconocido apaga la IA real (respaldo fijo), se registra al arrancar como `config.invalid` (`AI_PROVIDER_UNKNOWN`) y `/api/health` responde `degraded` |
| `GOOGLE_CLIENT_API` | API key de Google AI. Viaja en la cabecera `x-goog-api-key`, nunca en la URL. Vacía o inválida: Gemini falla y el mensaje libre vuelve al menú (log `ai.fallback`) |
| `GOOGLE_AI_MODEL` | Modelo de Gemini (por defecto `gemini-3.6-flash`). Un nombre que no existe da HTTP 404 |

**Sandbox**

| Variable | Uso |
|---|---|
| `SANDBOX_ENABLED` | `true` habilita `POST /api/sandbox`, que **no tiene autenticación** (404 si no). Con las variables `SANDBOX_USE_REAL_*` en `true` llama a servicios reales: úsalo solo en local y Preview, nunca en Production |
| `SANDBOX_ALLOWED_ORIGINS` | Orígenes permitidos (CORS, separados por comas) para el widget del Sandbox en otro frontend. Una barra final se ignora. Ver [Conectar un frontend externo](#conectar-un-frontend-externo-widget-del-sandbox) |

**Logs** (ver [docs/observability.md](docs/observability.md))

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
app/                         rutas de Next.js (delgadas): bandeja web, /api/*, /webhook/whatsapp, páginas del Sandbox
  components/                UI de la bandeja y del Sandbox; Sandbox.tsx es el contenedor del chat
    sandbox-chat/            piezas de presentación del chat (cabecera, composer, burbujas, tarjeta de DNI, panel de depuración)
    ui/                      componentes de UI compartidos (IconButton, OptionButton, Badge, ErrorBanner)
    icons/                   todos los íconos SVG de la app, centralizados
lib/
  enums/                     enums reales para estados y tipos que antes eran texto suelto (SendType, ApiErrorCode)
  utils/                     funciones puras que no dependen de React ni del render
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
          booking/           reserva, duplicados, referencias médicas
          exit/              salida/cancelación del flujo
          hora/              el paso de hora: lista, horas escritas, elección «1»..«10», confirmación
          demo/              flujo hardcodeado para el piloto comercial; borrar junto con su importador al cerrarlo
      reclamo/               flujo de reclamo
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
| **Comentarios** | No se comentan líneas ni bloques. Solo un docstring breve, en español, en funciones o tipos complejos cuya razón no se puede expresar en el código. |
| **Estados y tipos como enums** | Los textos fijos que representan un estado o un tipo (`SendType`, `ApiErrorCode`) son un `enum` en `lib/enums/`, nunca un string suelto comparado a mano. |
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
| Eventos de log | `lib/observability/events.ts` (`LogEvent`, `TurnNoteKind`) | TypeScript rechaza un nombre que no esté en el catálogo; un test exige que cada evento figure en `docs/observability.md`. Nada del servidor escribe en la consola directamente |
| Configuración | `lib/config/config-errors.ts` (`CONFIG_ERRORS`) | `instrumentation.ts` revisa la configuración al arrancar y registra cada problema como `config.invalid`; `/api/health` pasa a `degraded`. El bot no se detiene |
| Textos al ciudadano | `lib/fsm/core/failure-texts.ts` | Los textos de falla viven en un solo lugar; un test de oro los fija byte a byte |
| Respuestas HTTP | `lib/http/api-error.ts` (`API_ERRORS`, `apiError`) | Toda respuesta de error es `{ error: CÓDIGO, message }` (más `detail` opcional), con el status del catálogo y el mensaje en español. Los `403` del webhook siguen en texto plano porque Meta no lee el cuerpo |

Para agregar un error nuevo: sumar su entrada al catálogo que corresponde y usarlo desde ahí; nunca un string suelto.

## Pruebas

| Comando | Qué corre |
|---|---|
| `npm test` | Suite completa (unitarias, escenarios, seguridad, estrés) con almacenes en memoria y fakes; no necesita secretos ni base de datos, y fija `DATABASE_URL` vacío aunque el runner exporte uno (GitLab Auto DevOps lo hace) |
| `npm run test:perf` | Pruebas de rendimiento (latencia P99, heap, ReDoS). Corren solas, porque en paralelo con la suite sus límites de tiempo fallan sin motivo real |
| `npm run test:gaps` | La suite en modo estricto para las brechas conocidas (`tests/support/known-gap.ts`) |
| `npm run smoke:postgres` | Pruebas de humo contra una base PostgreSQL real (hay que definir `DATABASE_URL` y `DATABASE_ENABLED=true`) |
| `npm run db:test` | Arma una base desechable solo con las migraciones y corre las pruebas SQL de `prisma/tests/` (necesita `psql` y un `DATABASE_URL`) |
| `npm run db:diccionario` | Regenera el diccionario de datos y los diagramas de la base desde una base ya migrada |

El CI (GitHub Actions) ejecuta tipos, lint, `npm test` y `test:perf` en cada pull request. Ver [docs/ci.md](docs/ci.md).

## Despliegue en Vercel (con base de datos)

`DATABASE_URL` y las variables de WhatsApp ya están configuradas en Vercel. El script `build` ejecuta `prisma migrate deploy` antes de `next build`, así que las migraciones pendientes se aplican en cada despliegue:

```json
"build": "prisma migrate deploy && next build --webpack"
```

- `--webpack` fuerza el compilador clásico en lugar de Turbopack, cuyo build de producción fallaba al prerenderizar `_global-error` en esta versión de Next.js.
- Correr las migraciones dentro del build es un enfoque simple, suficiente para la escala actual. Conviene revisarlo si el equipo crece o si las migraciones se vuelven riesgosas de ejecutar sin supervisión.
- `next.config.ts` solo activa la salida *standalone* cuando `NEXT_OUTPUT_STANDALONE=true` (lo hace el Dockerfile), así que los builds de Vercel no cambian.

## Sandbox (probador de los flujos de cita y reclamo)

Junto a la bandeja real, `/` tiene una pestaña **Sandbox**: un simulador de conversación para los flujos de cita médica y de reclamo, escribiendo mensajes directamente, sin WhatsApp real. Usa la misma máquina de estados (`lib/fsm/`) y nunca toca las conversaciones reales.

- Está **desactivado por defecto** (`SANDBOX_ENABLED=false`) porque la aplicación no tiene autenticación propia: cualquiera que abra la URL pública lo vería.
- Con las integraciones en su valor por defecto (`false`), funciona sin conexión con datos de prueba fijos: DNI `12345678` (8 dígitos) o carnet de extranjería `123456789` (9 dígitos), OTP `1234`, distrito `lurigancho`. El bot pide solo el número de documento y el largo decide el tipo (`01` DNI, `03` carnet de extranjería), que viaja como `tipo_documento` a MINSA.

## Notas técnicas

- **Webhook en runtime Node.js.** `app/webhook/whatsapp/route.ts` no corre en Edge porque la verificación de la firma necesita el módulo `crypto` de Node. La ruta está fija en `/webhook/whatsapp` para coincidir con la URL de callback registrada en Meta for Developers.
- **Ventana de atención de 24 horas.** Se calcula desde el **último mensaje entrante** de la conversación, no desde la actividad general.
- **Identificadores BSUID.** Los contactos de esta cuenta usan el esquema *Business-Scoped User ID* de Meta. Los webhooks traen `user_id`/`from_user_id` en lugar de `wa_id`/`from`, y los envíos deben usar `recipient` (con `recipient_type: "individual"`) en lugar de `to`: con `to`, Graph API acepta la petición pero el mensaje nunca se entrega.
- **Sin autenticación.** La aplicación no incluye login; por eso el Sandbox está desactivado por defecto.
- **Carga diferida de Prisma.** `@prisma/client` lee el `.env` al cargarse; por eso el ejecutor importa `lib/recepcion/servicio` de forma diferida y no se carga en los turnos que no tocan la base.

## Documentación relacionada

| Documento | Contenido |
|---|---|
| [docs/flujo-cita.md](docs/flujo-cita.md) | Árbol del flujo de cita: listas, botones, texto libre que entiende cada paso y todas las ramas de error |
| [docs/ci.md](docs/ci.md) | Qué comprueba el CI y la regla de la rama `main` |
| [docs/observability.md](docs/observability.md) | Logs estructurados, trazas y enmascarado |
| [docs/technical-gaps.md](docs/technical-gaps.md) | Brechas técnicas conocidas y su estado |
| [docs/out-of-scope-channels.md](docs/out-of-scope-channels.md) | Canales oficiales de derivación pendientes de confirmar |
| [docs/qa/manual-test-playbook.md](docs/qa/manual-test-playbook.md) | Casos de prueba manual |
