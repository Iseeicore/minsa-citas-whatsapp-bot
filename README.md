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

1. Crea un `.env` (ignorado por git) junto a `docker-compose.yml` con, como mínimo, las cuatro credenciales de Meta: `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `META_WEBHOOK_VERIFY_TOKEN` y `META_APP_SECRET`.
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
- **Webhook de Meta:** configura la URL de callback como `https://<servidor>/webhook/whatsapp`. El HTTPS lo termina el proxy inverso del servidor, no el contenedor.

> **Una sola instancia.** En este modo el estado de cada conversación vive en la memoria del proceso. Una segunda réplica no vería esas sesiones y rompería los flujos a la mitad, y un reinicio hace que quien estaba en medio de un trámite empiece de nuevo. Ver [Modos de persistencia](#modos-de-persistencia).

## Desarrollo local

1. Instala las dependencias (también ejecuta `prisma generate` mediante `postinstall`):

   ```bash
   npm install
   ```

2. Copia `.env.example` a `.env` y completa los valores reales (un `DATABASE_URL` de Neon y las credenciales de WhatsApp Cloud API).
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

Escalar el modo sin base de datos a varias instancias requiere un almacén compartido (por ejemplo, Redis con expiración) detrás de `lib/fsm/session/session-store.ts` y `lib/whatsapp/webhook/inbound-dedupe.ts`.

## Variables de entorno

La plantilla está en `.env.example`.

**WhatsApp Cloud API (obligatorias)**

| Variable | Uso |
|---|---|
| `META_ACCESS_TOKEN` | Token de acceso de WhatsApp Cloud API |
| `META_PHONE_NUMBER_ID` | ID del número que envía los mensajes |
| `META_WEBHOOK_VERIFY_TOKEN` | Secreto compartido para la verificación del webhook |
| `META_APP_SECRET` | Valida la cabecera `X-Hub-Signature-256` de los webhooks entrantes |
| `META_GRAPH_API_VERSION` | Versión de Graph API (por ejemplo, `v21.0`) |

**Persistencia**

| Variable | Uso |
|---|---|
| `DATABASE_ENABLED` | `false` = sin base de datos. Vacía = con base de datos |
| `DATABASE_URL` | Cadena de conexión de Neon. No hace falta con `DATABASE_ENABLED=false` |
| `HOST_PORT` | Solo Docker Compose: puerto publicado en el servidor (por defecto 3000) |

**Integraciones** (sin ellas, el bot usa datos de prueba fijos)

| Variable | Uso |
|---|---|
| `SANDBOX_USE_REAL_MINSA` | `true` llama a las APIs reales del MINSA (identidad, catálogo, reserva) y de quejas |
| `SANDBOX_USE_REAL_RENIEC` | `true` usa la consulta real a RENIEC del flujo de reclamo |
| `SANDBOX_USE_REAL_AI` | `true` usa Gemini para interpretar texto libre |
| `MINSA_API_HOST`, `MINSA_INTEGRATION_SECRET`, `MINSA_CONVERSATION_ID_PLACEHOLDER` | Solo con `SANDBOX_USE_REAL_MINSA=true` |
| `RENIEC_LOOKUP_BASE_URL` | Solo con `SANDBOX_USE_REAL_RENIEC=true` |
| `QUEJAS_API_BASE_URL` | URL base de la API de quejas |
| `GOOGLE_CLIENT_API`, `GOOGLE_AI_MODEL` | API key y modelo de Gemini. La key viaja en la cabecera `x-goog-api-key`, nunca en la URL |

**Sandbox y operación**

| Variable | Uso |
|---|---|
| `SANDBOX_ENABLED` | `true` habilita `/api/sandbox` (responde 404 si no) |
| `SANDBOX_ALLOWED_ORIGINS` | Orígenes permitidos (CORS) para el widget del Sandbox en otro frontend |
| `LOG_LEVEL`, `LOG_TO_FILE`, `LOG_DIR` | Nivel de log y escritura opcional en archivos diarios (ver [docs/observability.md](docs/observability.md)) |
| `INBOUND_RATE_LIMIT` | Límite de mensajes entrantes por ciudadano |
| `TURN_PROCESS_LOCK_TIMEOUT_MS`, `TURN_LOCK_TIMEOUT_MS`, `TURN_LOCK_MAX_CONCURRENCY`, `TURN_DB_LOCK` | Ajustes del candado de turno |

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
      ai/                    interpretación asistida por Gemini, un módulo por tarea (distrito, intención del menú, fecha, pistas);
                             gemini.ts es el único helper de peticiones compartido
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

## Pruebas

| Comando | Qué corre |
|---|---|
| `npm test` | Suite completa (unitarias, escenarios, seguridad, estrés) con almacenes en memoria y fakes; no necesita secretos ni base de datos |
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
