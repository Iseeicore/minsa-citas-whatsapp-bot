# Bot de citas MINSA por WhatsApp

Bot de WhatsApp (WhatsApp Business Cloud API) que atiende a la ciudadanía: agenda citas médicas en el MINSA, registra reclamos, deriva urgencias y consultas fuera de alcance a los canales oficiales. Está construido con Next.js (App Router) y puede correr de dos formas: **con base de datos** (Vercel + Neon, con bandeja web de conversaciones) o **sin base de datos** (servidor del MINSA en Docker, solo responde mensajes y no guarda nada).

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

Detalles de la imagen:

- **Base:** `node:22-alpine` (la misma versión de Node que usa el CI), multi-stage, compilada con `npm run build:no-db` y la salida *standalone* de Next.
- **Seguridad:** corre con el usuario sin privilegios `node`; los secretos solo entran como variables de entorno, nunca quedan dentro de la imagen.
- **Salud:** el `HEALTHCHECK` consulta `GET /api/health`, que no toca la base de datos.
- **Puerto:** 3000 dentro del contenedor; `HOST_PORT` cambia el puerto publicado en el servidor (por defecto 3000).
- **Variables:** `docker-compose.yml` pasa al contenedor **todas** las variables del `.env` (`env_file`). Solo fija tres: `NODE_ENV=production`, `PORT=3000` y `HOSTNAME=0.0.0.0`, para que un valor olvidado en el `.env` no saque al servidor del puerto que usan el mapeo y el healthcheck. Las 4 credenciales de Meta son obligatorias.
- **Base de datos:** `DATABASE_ENABLED` vale `false` si no se define. La imagen se compila sin migraciones, así que `true` solo funciona contra un `DATABASE_URL` ya migrado (`npx prisma migrate deploy` ejecutado aparte) y deja de exigir una sola instancia.
- **Webhook de Meta:** configura la URL de callback como `https://<servidor>/webhook/whatsapp`. El HTTPS lo termina el proxy inverso del servidor, no el contenedor.

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

2. Copia `.env.example` a `.env` y completa los valores reales (un `DATABASE_URL` de Neon y las credenciales de WhatsApp Cloud API). **Deja `DATABASE_ENABLED` vacía:** el `false` del bloque mínimo es para el servidor en Docker.
3. Aplica el esquema a tu base de datos de desarrollo:

   ```bash
   npx prisma migrate dev
   ```

4. Levanta el servidor de desarrollo:

   ```bash
   npm run dev
   ```

## Modos de persistencia

La variable `DATABASE_ENABLED` decide si el bot usa base de datos. Solo el valor exacto `false` la desactiva; vacía o con cualquier otro valor, la base de datos sigue activa.

| Aspecto | Con base de datos (por defecto, Vercel) | Sin base de datos (`DATABASE_ENABLED=false`, Docker) |
|---|---|---|
| ORM (Prisma) | Conectado a Neon | Nunca se instancia ni abre conexión; `DATABASE_URL` puede faltar |
| Estado de cada conversación | Tabla `SandboxSession` | En memoria; se descarta tras 1 h sin actividad (6 × el timeout de sesión de 10 min, para que el aviso de «tu sesión expiró» siga funcionando) |
| Reentregas de Meta (no responder dos veces) | Índice único `waMessageId` | Lista en memoria de ids de mensaje, conservada 24 h |
| Historial de mensajes y estados de entrega | Tablas `Conversation` y `Message` | No se guarda nada |
| Bandeja web (`/api/conversations*`, `/api/messages/send`) | Disponible | Responde `503 {"error":"persistence disabled"}` |
| Candado de turno por ciudadano | Postgres (advisory lock) | En memoria, aunque exista `DATABASE_URL` |
| Build | `npm run build` (aplica migraciones) | `npm run build:no-db` (sin migraciones) |

Escalar el modo sin base de datos a varias instancias requiere un almacén compartido externo, con expiración, detrás de `lib/fsm/session/session-store.ts` y `lib/whatsapp/webhook/inbound-dedupe.ts`. Hoy el proyecto no usa ninguno.

## Variables de entorno

`.env.example` es solo la lista de variables, sin comentarios: **esta sección es su documentación.** Cópialo a `.env` y completa los valores. Está dividido en dos bloques:

| Bloque | Qué contiene | Cuándo basta |
|---|---|---|
| `##### Mínimo: servidor MINSA en Docker (…)` | Meta (5), MINSA (4), Gemini (3), Sandbox (`SANDBOX_ENABLED=true`, `SANDBOX_ALLOWED_ORIGINS`) y `DATABASE_ENABLED=false` | El servidor del MINSA en Docker: citas por WhatsApp y el frontend de MINSA Digital conectado, sin base de datos |
| `##### Completo: variables opcionales` | Base de datos, reclamos (RENIEC y quejas), logs, perímetro, candado y `HOST_PORT` | Todo lo demás: Vercel o desarrollo local con base de datos, el flujo de reclamo, ajustes finos |

La versión completa es el archivo entero; la mínima es solo el primer bloque. Ninguna variable se repite entre bloques.

> **El bloque mínimo está pensado para Docker.** Si copias el archivo para **Vercel o desarrollo local**, deja `DATABASE_ENABLED` vacía (con `false` no hay bandeja web ni historial) y pon `SANDBOX_ENABLED=false` en Production (el Sandbox no tiene autenticación).

- **Sin el bloque completo, el reclamo no funciona:** el menú lo sigue ofreciendo, pero sin `RENIEC_LOOKUP_BASE_URL`, `SANDBOX_USE_REAL_RENIEC=true` y `QUEJAS_API_BASE_URL` solo acepta el DNI de prueba y el envío falla.
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
| `DATABASE_URL` | Cadena del pooler de Neon. Con base de datos también se necesita al compilar, porque `npm run build` ejecuta `prisma migrate deploy`. No hace falta con `DATABASE_ENABLED=false` |
| `HOST_PORT` | Solo Docker Compose: puerto publicado en el servidor (por defecto `3000`) |

**MINSA, RENIEC y quejas** (en `false`, el bot usa datos de prueba fijos)

| Variable | Uso |
|---|---|
| `SANDBOX_USE_REAL_MINSA` | `true`: MINSA real (identidad, catálogo, agendamiento) y API de quejas real. **La lee también el webhook real, no solo el Sandbox** |
| `MINSA_API_HOST` | Host de la API del MINSA |
| `MINSA_INTEGRATION_SECRET` | Secreto con el que se firma la petición de identidad (DNI y OTP) |
| `MINSA_CONVERSATION_ID_PLACEHOLDER` | ID de conversación que el MINSA exige en la petición de identidad |
| `QUEJAS_API_BASE_URL` | API que recibe los reclamos; se usa con `SANDBOX_USE_REAL_MINSA=true` |
| `SANDBOX_USE_REAL_RENIEC` | `true`: RENIEC real. `false`: solo el DNI de prueba `12345678` |
| `RENIEC_LOOKUP_BASE_URL` | Servicio que valida el DNI y devuelve el nombre |

**IA** (ver [Cambiar de proveedor de IA](#cambiar-de-proveedor-de-ia))

| Variable | Uso |
|---|---|
| `SANDBOX_USE_REAL_AI` | `true`: IA real (intención del mensaje libre, distrito, fecha y pistas). `false`: diccionario de prueba, sin costo |
| `AI_PROVIDER` | Proveedor de IA. Vacía o `gemini`: Gemini (hoy el único). Un valor desconocido apaga la IA real (respaldo fijo) y se registra una vez como `ai.provider_unknown` |
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
lib/
  db/                        cliente Prisma (carga diferida) y el flag DATABASE_ENABLED
  whatsapp/                  envío de mensajes y descarga de media (Meta Cloud API)
    webhook/                 pipeline de entrada: mapeo del payload, guardado + candado de turno, respuesta al ciudadano,
                             control de reentregas en memoria (modo sin base de datos)
  integrations/              clientes HTTP de servicios externos: RENIEC, quejas
    minsa/                   cliente del MINSA separado por endpoint: identidad, catálogo, reserva (+ wire, formato, fakes)
  observability/             logger estructurado, tracer, enmascarado de datos personales, logs en archivo
  security/                  perímetro del webhook: filtro de payload, rate limiter, guardia léxica
  fsm/                       la máquina de estados de la conversación
    core/                    motor: tipos de sesión, ejecutor, despachador de turnos (handle)
    session/                 persistencia de sesión (base de datos o memoria), expiración, reverificación,
                             candado de turno por ciudadano
    routing/                 primer contacto, bienvenida, menú principal, enrutamiento de la guardia léxica, entrada a un flujo
    parsing/                 lectura del texto del ciudadano: fechas, horas, selecciones, texto
      ai/                    interpretación asistida por IA, un módulo por tarea (distrito, intención del menú, fecha, pistas);
                             llm.ts es el puerto, llm-registry.ts elige el proveedor
        providers/           un adaptador por proveedor de IA (hoy gemini.ts)
    flows/
      cita/                  flujo de cita: handlers-cita.ts enruta cada estado a steps/
        steps/               un módulo por paso de la conversación (identidad, ubigeo, catálogo, fecha, hora, reserva…)
          hora/              el paso de hora: lista, horas escritas, elección «1»..«10», confirmación
      reclamo/               flujo de reclamo
      emergency/             corte por urgencia
      out-of-scope/          detección de consultas fuera de alcance y los canales oficiales a los que deriva
tests/                       suites transversales: security/, stress/, integration/, smoke/ (Neon real), support/
data/                        datos estáticos (distritos del Perú)
prisma/                      esquema y migraciones
scripts/  docs/              herramientas y documentación del proyecto
```

Convenciones (ESLint las hace cumplir donde se indica):

| Regla | Detalle |
|---|---|
| **Imports siempre con el alias `@/`** | Los imports relativos se rechazan (`no-restricted-imports`). |
| **Sin ciclos de imports** | `import/no-cycle`; solo se permiten ciclos a través de un `import()` diferido. |
| **Tests junto al archivo que prueban** | `x.ts` + `x.test.ts`; los tests de escenario van en la carpeta del área que ejercitan (por ejemplo, `flows/cita/hora-choice.test.ts`). |
| **Organización por flujo, no por capa** | Un error en un paso de la conversación vive en `lib/fsm/flows/<flujo>/`. |
| **Comentarios** | No se comentan líneas ni bloques. Solo un docstring breve, en español, en funciones o tipos complejos cuya razón no se puede expresar en el código. |

### Cambiar de proveedor de IA

Las tareas de IA no conocen al proveedor: piden un JSON a un `LlmClient` (`lib/fsm/parsing/ai/llm.ts`) con un JSON Schema estándar, y `getLlmClient()` (`llm-registry.ts`) decide cuál se usa según `AI_PROVIDER`.

| Paso | Qué hacer |
|---|---|
| 1. Adaptador | Crear `lib/fsm/parsing/ai/providers/<proveedor>.ts` que implemente `LlmClient.generateJson`: traducir el JSON Schema al formato del proveedor, hacer la petición con `timedFetch` y devolver `LlmJsonOutcome` (los mismos 4 tipos de falla que Gemini) |
| 2. Registro | Sumar el proveedor a `LlmProvider` (`llm.ts`) y a `PROVIDERS` (`llm-registry.ts`) |
| 3. Configuración | Definir `AI_PROVIDER=<proveedor>` y su API key, y documentar la variable nueva aquí y en `.env.example` |
| 4. Tests | Probar el adaptador con `fetch` simulado, como `providers/gemini.test.ts`; las tareas ya se prueban con un `LlmClient` falso |

Las tareas, los prompts y el FSM no cambian.

## Pruebas

| Comando | Qué corre |
|---|---|
| `npm test` | Suite completa (unitarias, escenarios, seguridad, estrés) con almacenes en memoria y fakes; no necesita secretos ni base de datos, y fija `DATABASE_URL` vacío aunque el runner exporte uno (GitLab Auto DevOps lo hace) |
| `npm run test:perf` | Pruebas de rendimiento (latencia P99, heap, ReDoS). Corren solas, porque en paralelo con la suite sus límites de tiempo fallan sin motivo real |
| `npm run test:gaps` | La suite en modo estricto para las brechas conocidas (`tests/support/known-gap.ts`) |
| `npm run smoke:neon` | Pruebas de humo contra una base Neon real |

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
- Con las integraciones en su valor por defecto (`false`), funciona sin conexión con datos de prueba fijos: DNI `12345678`, OTP `1234`, distrito `lurigancho`.

## Notas técnicas

- **Webhook en runtime Node.js.** `app/webhook/whatsapp/route.ts` no corre en Edge porque la verificación de la firma necesita el módulo `crypto` de Node. La ruta está fija en `/webhook/whatsapp` para coincidir con la URL de callback registrada en Meta for Developers.
- **Ventana de atención de 24 horas.** Se calcula desde el **último mensaje entrante** de la conversación, no desde la actividad general.
- **Identificadores BSUID.** Los contactos de esta cuenta usan el esquema *Business-Scoped User ID* de Meta. Los webhooks traen `user_id`/`from_user_id` en lugar de `wa_id`/`from`, y los envíos deben usar `recipient` (con `recipient_type: "individual"`) en lugar de `to`: con `to`, Graph API acepta la petición pero el mensaje nunca se entrega.
- **Sin autenticación.** La aplicación no incluye login; por eso el Sandbox está desactivado por defecto.

## Documentación relacionada

| Documento | Contenido |
|---|---|
| [docs/ci.md](docs/ci.md) | Qué comprueba el CI y la regla de la rama `main` |
| [docs/observability.md](docs/observability.md) | Logs estructurados, trazas y enmascarado |
| [docs/technical-gaps.md](docs/technical-gaps.md) | Brechas técnicas conocidas y su estado |
| [docs/out-of-scope-channels.md](docs/out-of-scope-channels.md) | Canales oficiales de derivación pendientes de confirmar |
| [docs/qa/manual-test-playbook.md](docs/qa/manual-test-playbook.md) | Casos de prueba manual |
