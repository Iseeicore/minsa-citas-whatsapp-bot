# Desarrollo

Cómo está armado el bot y cómo se trabaja en él: canales, desarrollo local, modos de persistencia, estructura, IA, errores, pruebas y build. El despliegue, la imagen Docker y la referencia de todas las variables están en [despliegue-minsa.md](despliegue-minsa.md).

## Canales

Los dos canales usan la misma máquina de estados (`lib/fsm/`); cambia cómo llega y cómo se muestra el mensaje.

| Canal | Entrada | Quién lo usa | Se activa con |
|---|---|---|---|
| **whatsapp-bot** | `POST /webhook/whatsapp` (Meta) | La ciudadanía, por WhatsApp | Las credenciales de Meta (obligatorias) |
| **Chat-bot** | `POST /api/sandbox`, y las páginas `/sandbox` y `/configuracion-visor-sandbox` | El portal de MINSA Digital, y el equipo para probar los flujos | `SANDBOX_ENABLED=true` (la ruta) y `SANDBOX_PAGE_ENABLED=true` (las páginas) |

- Los nombres `SANDBOX_*`, `/api/sandbox` y `/sandbox` son identificadores históricos del Chat-bot en el código y no se renombran.
- El menú es el mismo en los dos canales: **Agendar una cita médica**, **Cita con referencia** y, con la bandera, las dos filas de incidencias; los números escritos apuntan a lo mismo en whatsapp-bot y en el Chat-bot.
- Una incidencia guarda el canal de origen real (ver [flujo-incidencia.md](flujo-incidencia.md)).

## Desarrollo local

1. Instala las dependencias (también ejecuta `prisma generate` mediante `postinstall` e instala el [hook de pre-commit](#hook-de-pre-commit) mediante `prepare`):

   ```bash
   npm install
   ```

2. Copia `.env.example` a `.env` y completa los valores reales (un `DATABASE_URL` de PostgreSQL y las credenciales de WhatsApp Cloud API). **Deja `DATABASE_ENABLED` vacía** si quieres usar la base: el `true` del bloque mínimo es para el servidor en Docker. Con `false` no hay bandeja web ni historial.
3. Aplica el esquema a tu base de datos de desarrollo (PostgreSQL 16 o superior):

   ```bash
   npx prisma migrate deploy
   npm run db:aplicar
   ```

   Las migraciones crean solo la estructura: cuatro esquemas (`catalogo`, `chatbot`, `gestion` e `ia`), tablas, columnas, índices y restricciones. `npm run db:aplicar` carga después las funciones, los disparadores, los comentarios y las semillas de catálogo (`prisma/sql` y `prisma/seeds/catalogos`). Cómo se cambia una regla de la base y la carga inicial están en [`prisma/README.md`](../prisma/README.md).

4. (Opcional) Carga datos de arranque. Solo corren contra una base cuyo nombre termine en `_desechable`, `_dev` o `_local`, y necesitan `psql` y `DATABASE_URL`:

   - `npm run db:seed:eess` carga el padrón de establecimientos (`--base-real=<base>` lo permite en otra base).
   - `npm run db:seed:dev` carga incidencias de ejemplo; si ya existen, `--reiniciar` las borra y las vuelve a crear.

   En el servidor de MINSA no corre ninguna semilla: los 4 hospitales de la primera etapa los carga un DBA con `SELECT catalogo.cargar_hospitales_fase_1();` (función que crea el arranque, no un dato). Ver la [sección 7 de despliegue-minsa.md](despliegue-minsa.md#7-carga-inicial-hospitales-y-administrador).

5. Levanta el servidor de desarrollo:

   ```bash
   npm run dev
   ```

**Hot-reload sobre el mismo compose.** Copia `docker-compose.override.yml.example` a `docker-compose.override.yml` (ignorado por git, nunca se versiona) y Docker Compose lo carga automáticamente junto al archivo base: monta el código fuente como volumen, corre `npm run dev` dentro del contenedor y excluye `node_modules`/`.next` del bind mount.

## Modos de persistencia

El bot corre de dos formas: **con base de datos** (PostgreSQL, con bandeja web de conversaciones; así corre el servidor del MINSA en Docker) o **sin base de datos** (`DATABASE_ENABLED=false`: solo responde mensajes y no guarda nada). Solo el valor exacto `false` la desactiva; vacía o con cualquier otro valor, la base de datos sigue activa.

| Aspecto | Con base de datos (por defecto) | Sin base de datos (`DATABASE_ENABLED=false`) |
|---|---|---|
| ORM (Prisma) | Conectado a PostgreSQL | Nunca se instancia ni abre conexión; `DATABASE_URL` puede faltar |
| Estado de cada conversación | Tabla `chatbot.sesion_conversacion` | En memoria; se descarta tras 1 h sin actividad (6 × el timeout de sesión de 10 min, para que el aviso de «tu sesión expiró» siga funcionando) |
| Reentregas de Meta (no responder dos veces) | Índice único `wa_message_id` | Lista en memoria de ids de mensaje, conservada 24 h |
| Usuarios, historial de mensajes y estados de entrega | Tablas `chatbot.usuario` y `chatbot.mensaje` | No se guarda nada |
| Autorización de datos de la denuncia | Columna `chatbot.usuario.consentimiento_aceptado_en` | En la memoria del proceso: se vuelve a pedir tras un reinicio |
| Incidencias | Tabla `chatbot.incidencia_paciente`, con historial de cambios | **No se pueden guardar**: el bot responde que no pudo registrar la incidencia |
| Bandeja web (`/api/conversations*`, `/api/messages/send`) | Disponible solo con `SANDBOX_PAGE_ENABLED=true`; sin ella responde `404`. Una conversación que no existe responde `404` `NOT_FOUND` (también al pedir sus mensajes). Si WhatsApp rechaza el envío responde `502` `WHATSAPP_REJECTED`; si no está disponible, limita el número o no se pudo llamar, `503` `WHATSAPP_UNAVAILABLE`; en ambos casos no se guarda el mensaje y queda `inbox.send_failed`. La lista y la conversación muestran «Cargando…» hasta la primera respuesta y un aviso cuando no se pueden actualizar, en vez de quedarse con datos viejos sin decirlo; tras cada falla seguida la consulta espera el doble (4 s, 8 s, 16 s…, hasta 60 s) y después de 5 fallas seguidas deja de consultar hasta recargar la página (constantes en `lib/constants/limits/inbox.ts`) | Con `SANDBOX_PAGE_ENABLED=true` responde `503` con `{"error":"PERSISTENCE_DISABLED","message":"…"}`; sin ella, `404` |
| Candado de turno por ciudadano | Postgres (advisory lock) | En memoria, aunque exista `DATABASE_URL` |
| Imágenes de la denuncia que llegan juntas | Se agrupan (ventana de 3 s) y reciben **una** respuesta | Sin agrupador: una respuesta por imagen |
| Build | `npm run build` (aplica migraciones y SQL) | `npm run build:no-db` (sin migraciones) |

- **Una sola instancia.** Sin base, el estado de cada conversación vive en la memoria del proceso. Una segunda réplica no vería esas sesiones y rompería los flujos a la mitad, y un reinicio hace que quien estaba en medio de un trámite empiece de nuevo.
- Escalar el modo sin base de datos a varias instancias requiere un almacén compartido externo, con expiración, detrás de `lib/fsm/session/session-store.ts` y `lib/whatsapp/webhook/inbound-dedupe.ts`. Hoy el proyecto no usa ninguno.

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
  integrations/              clientes HTTP de servicios externos: el MINSA
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
prisma/                      esquema, migraciones (solo estructura), sql (funciones y disparadores) y semillas
scripts/  docs/              herramientas y documentación del proyecto
```

Convenciones (ESLint y las pruebas las hacen cumplir donde se indica):

| Regla | Detalle |
|---|---|
| **Imports siempre con el alias `@/`** | Los imports relativos se rechazan (`no-restricted-imports`). |
| **Sin ciclos de imports** | `import/no-cycle`; solo se permiten ciclos a través de un `import()` diferido. |
| **Tests en estructura espejo, no colocalizados** | `lib/<ruta>/x.ts` tiene su test en `tests/lib/<la-misma-ruta>/x.test.ts`. Los tests de escenario de un flujo van en la misma ruta espejo (por ejemplo, `tests/lib/fsm/flows/cita/hora-choice.test.ts`). El alias `@/` resuelve igual sin importar dónde viva el test, así que nunca hace falta un import relativo (`../../`). |
| **Organización por flujo, no por capa** | Un error en un paso de la conversación vive en `lib/fsm/flows/<flujo>/`. |
| **Comentarios** | El código, las migraciones y las pruebas SQL no llevan comentarios ni docstrings: la intención va en los nombres y la explicación en `docs/`. La única excepción son las directivas que necesita una herramienta (por ejemplo `eslint-disable`). |
| **Formato único con Prettier** | Líneas de hasta 140 caracteres, dos espacios, comillas dobles, punto y coma y coma final (`.prettierrc.json`). `npm run format` lo aplica y el CI lo exige con `npm run format:check`. Por ahora cubre `lib/`, `tests/`, `scripts/` y los archivos de configuración de la raíz; `app/` y `tests/app/` todavía no se formatean (`.prettierignore`). |
| **Estados y tipos como enums** | Los textos fijos que representan un estado o un tipo (`SendType`, `ApiErrorCode`) son un `enum` en `lib/enums/`, nunca un string suelto comparado a mano. |
| **Textos y prompts en un solo lugar** | Los textos al ciudadano (constantes `*_TEXT`, botones `*_BUTTONS` y funciones cuando el texto lleva datos) viven en `lib/constants/textos/`, y los prompts de IA en `lib/constants/prompts/`, sin archivo índice. Un texto repetido es una sola constante. `tests/integration/textos-location.test.ts` lo hace cumplir. |
| **Expresiones regulares en un solo lugar** | Viven en `lib/constants/regex/` como constantes con nombre, sin archivo índice: se importa el archivo del dominio. `tests/integration/regex-location.test.ts` lo hace cumplir. |
| **Sin valores arbitrarios de Tailwind** | Nada de `bg-[var(--x)]`, `bg-[#hex]` ni `text-[10px]`. Los colores y tamaños se declaran como tokens en `@theme` (`app/globals.css`, Tailwind v4) y se usan con clases estándar. `tests/integration/ui-design-rules.test.ts` lo hace cumplir. |
| **Sin emojis en las vistas** | Se reemplazan por un ícono de `app/components/icons/`. El mismo test de arriba los detecta. |
| **UI repetida → componente** | Un bloque de clases de Tailwind que se repite en más de un lugar se extrae a `app/components/ui/`. |
| **Lógica pura fuera de la vista** | Una función sin hooks de React (cálculo, formato, parseo) vive en `lib/utils/`, con su test. |
| **Variables de entorno** | `.env.example` es solo la lista de variables, sin comentarios ni espacios alrededor del valor (`NOMBRE=valor`) y sin valores reales: se versiona. Empieza con el bloque `##### Mínimo` (lo que necesita el servidor MINSA en Docker) y sigue con `##### Completo` (las opcionales); ninguna variable se repite. `tests/integration/env-example.test.ts` falla si lista una variable que el código no lee o si le falta una que sí lee. Una variable nueva se agrega también al bloque del [README](../README.md#variables-de-entorno) y a la [referencia de variables](despliegue-minsa.md#36-referencia-de-todas-las-variables). |

## Cambiar de proveedor de IA

Las tareas de IA no conocen al proveedor: piden un JSON a un `LlmClient` (`lib/fsm/parsing/ai/llm.ts`) con un JSON Schema estándar, y `lookupLlmClient()` (`llm-registry.ts`) decide cuál se usa según `AI_PROVIDER`. Devuelve una unión: `AVAILABLE` con el cliente o `MISCONFIGURED` si el proveedor no está registrado (la tarea responde como no disponible). Si `SANDBOX_USE_REAL_AI` no es `true`, el cliente es el adaptador falso `providers/fake.ts`, que implementa el mismo puerto y responde cada tarea con sus respuestas fijas sin llamar a un modelo; las tareas no saben si hablan con el falso o con el real. Las tareas no buscan el cliente por su cuenta: lo recibe cada una del ejecutor (`resolveQuery` en `lib/fsm/core/executor.ts`), que llama a `lookupLlmClient()`.

| Paso | Qué hacer |
|---|---|
| 1. Adaptador | Crear `lib/fsm/parsing/ai/providers/<proveedor>.ts` que implemente `LlmClient.generateJson`: traducir el JSON Schema al formato del proveedor, hacer la petición con `timedFetch` y devolver `LlmJsonOutcome` (los mismos 4 tipos de falla que Gemini) |
| 2. Registro | Sumar el proveedor a `LlmProvider` (`llm.ts`) y a `PROVIDERS` (`llm-registry.ts`) |
| 3. Configuración | Definir `AI_PROVIDER=<proveedor>` y su API key, y documentar la variable nueva en el README, en la referencia de variables y en `.env.example` |
| 4. Tests | Probar el adaptador con `fetch` simulado, como `providers/gemini.test.ts`; las tareas ya se prueban con un `LlmClient` falso |

Las tareas, los prompts y el FSM no cambian.

## Manejo de errores

El bot es *fail-open*: una falla externa (MINSA, Gemini, WhatsApp) nunca deja al ciudadano sin respuesta; se convierte en un respaldo o en un texto fijo y queda registrada. Cada tipo de error tiene un único catálogo:

| Qué | Catálogo | Regla |
|---|---|---|
| Eventos de log | `lib/observability/events.ts` (`LogEvent`, `TurnNoteKind`) | TypeScript rechaza un nombre que no esté en el catálogo; un test exige que cada evento figure en [observabilidad.md](observabilidad.md). Nada del servidor escribe en la consola directamente |
| Configuración | `lib/config/config-errors.ts` (`CONFIG_ERRORS`) | `instrumentation.ts` revisa la configuración al arrancar y registra cada problema como `config.invalid`; `/api/health` pasa a `degraded` con los códigos en `config`. El bot no se detiene ni el contenedor se reinicia |
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
| `npm run test:coverage` | La misma suite con cobertura de `lib/` y `app/` y un límite de 30 s por prueba. Deja los reportes en `coverage/` (abrir `coverage/index.html`) y falla si el backend baja de los umbrales; es lo que corre el CI (ver [ci.md](ci.md#cobertura)) |
| `npm run test:perf` | Pruebas de rendimiento (latencia P99, heap, ReDoS). Corren solas, porque en paralelo con la suite sus límites de tiempo fallan sin motivo real |
| `npm run test:gaps` | La suite en modo estricto para las brechas conocidas (`tests/support/known-gap.ts`) |
| `npm run smoke:postgres` | Pruebas de humo contra una base PostgreSQL real (hay que definir `DATABASE_URL` y `DATABASE_ENABLED=true`) |
| `npm run db:aplicar` | Aplica `prisma/sql` y `prisma/seeds/catalogos` a la base de `DATABASE_URL` (se puede repetir) |
| `npm run db:test` | Arma una base desechable con las migraciones y los archivos SQL y corre las pruebas SQL de `prisma/tests/` (necesita `psql` y un `DATABASE_URL`) |
| `npm run db:diccionario` | Regenera `docs/base-de-datos/diccionario-de-datos.md` y `prisma/sql/comentarios.sql` desde una base ya armada |
| `npm run format` | Aplica el formato de Prettier al código |
| `npm run format:check` | Verifica el formato sin modificar archivos; es lo que corre el CI |

El CI (GitHub Actions) ejecuta tipos, lint, formato, `test:coverage` y `test:perf` en cada pull request. Ver [ci.md](ci.md).

## Hook de pre-commit

Antes de cada commit, [lint-staged](https://github.com/lint-staged/lint-staged) revisa **solo los archivos en stage** (configuración en la clave `lint-staged` de `package.json`):

| Archivos | Qué corre |
|---|---|
| `lib/`, `app/` y `tests/` con extensión `.ts` o `.tsx` | `eslint --fix`: corrige lo que ESLint sabe corregir solo y bloquea el commit si queda un error |
| Todos | `prettier --write --ignore-unknown`: respeta `.prettierignore`, así que hoy no toca `app/`, `docs/` ni los `.md` |

Las tareas corren en ese orden, una después de otra, y lo que corrigen entra en el mismo commit. No corre pruebas: las corre el CI. Si una tarea falla, lint-staged deja los archivos como estaban y el commit no se hace.

**Cómo se instala.** `npm install` (y `npm ci`) corren el script `prepare`, que ejecuta `scripts/instalar-hooks.mjs`:

- escribe un lanzador en `$(git rev-parse --git-common-dir)/hooks/pre-commit`, la carpeta de hooks compartida por el checkout y todos sus worktrees. El lanzador ejecuta `scripts/hooks/pre-commit` del checkout donde se hace el commit;
- no cambia ninguna configuración de git (no toca `core.hooksPath`) ni usa husky;
- si ya hay un `pre-commit` que no instaló él (no tiene su línea `instalado_por=...`), avisa y no lo toca;
- no hace nada si `CI` está definida (GitHub Actions) o si no está dentro de un repositorio git (el `npm ci` de la imagen Docker no tiene `.git` ni `scripts/`); nunca hace fallar la instalación de dependencias;
- se puede repetir: si el lanzador ya está al día no escribe nada.

Para instalarlo en un checkout que ya tenía `node_modules`: `npm run prepare` (o `npm install`).

- **Sin `core.hooksPath` propio** (lo normal): git ejecuta directamente `.git/hooks/pre-commit`.
- **Con un `core.hooksPath` global** (una carpeta de hooks propia en `~/.gitconfig`): git ya no mira `.git/hooks`, así que el hook solo corre si el `pre-commit` de esa carpeta reenvía a `$(git rev-parse --git-common-dir)/hooks/pre-commit`. El instalador no escribe nunca en la carpeta de `core.hooksPath`.

`scripts/hooks/pre-commit` deja pasar el commit con un aviso, sin bloquearlo, cuando el checkout no tiene `node_modules/.bin/lint-staged` (un worktree sin `npm install`) o cuando no encuentra `node`. Funciona con el `sh` de Git for Windows.

**Saltarlo.** `git commit --no-verify` omite el hook (y también `commit-msg`). Sirve para un commit de trabajo en curso que se va a reescribir, o para un commit que solo toca archivos que lint-staged no debe procesar. No se usa para esquivar un error de ESLint o de formato en un commit que va a un PR: el CI corre las mismas revisiones sobre todo el código y lo va a rechazar igual.

## Build con base de datos

Fuera de Docker, `npm run build` necesita `DATABASE_URL`: ejecuta `prisma migrate deploy` y `node scripts/db-aplicar-sql.mjs` antes de `next build`, así que las migraciones pendientes y los archivos SQL se aplican en cada build:

```json
"build": "prisma migrate deploy && node scripts/db-aplicar-sql.mjs && next build --webpack"
```

- `--webpack` fuerza el compilador clásico en lugar de Turbopack, cuyo build de producción fallaba al prerenderizar `_global-error` en esta versión de Next.js.
- La imagen Docker compila con `npm run build:no-db` y migra al arrancar el contenedor (ver [despliegue-minsa.md](despliegue-minsa.md#9-imagen-docker-y-arranque)).
- `next.config.ts` solo activa la salida *standalone* cuando `NEXT_OUTPUT_STANDALONE=true` (lo hace el Dockerfile); `npm run build` y `npm run dev` no la usan.

## Chat-bot: página de pruebas de los flujos

Junto a la bandeja real, `/` tiene una pestaña con el Chat-bot (en la interfaz aún se rotula «Sandbox»): un simulador de conversación para los flujos de cita médica, referencia e incidencia, escribiendo mensajes directamente, sin pasar por WhatsApp. Usa la misma máquina de estados (`lib/fsm/`) y nunca toca las conversaciones reales.

- Está **desactivado por defecto** (`SANDBOX_ENABLED=false`) porque la aplicación no tiene autenticación propia: cualquiera que abra la URL pública lo vería. Las páginas se controlan aparte con `SANDBOX_PAGE_ENABLED=true`; sin ella, `/sandbox` y `/configuracion-visor-sandbox` redirigen a `/api/health`.
- **La portada `/` se muestra siempre; la burbuja del Chat-bot solo con `SANDBOX_ENABLED=true`.** Sin ella, los enlaces de la portada que abrían el chat llevan al inicio de sesión de MINSA Digital.
- **Al abrir o recargar el Chat-bot no se restaura la conversación anterior:** el navegador avisa con `POST /api/sandbox` y `close: true` (responde `200 { "closed": true }` sin ejecutar ningún turno), la sesión anterior se cierra y empieza una nueva. En la base, la fila anterior queda como registro cerrado: su `wa_id` pasa a `cerrada-<from anterior>-<marca de tiempo>` y conserva `estado`, `slots` y `contadores`; `fecha_modificacion` pasa a ser la fecha de cierre (un disparador de la base la actualiza en cada cambio). **Reiniciar esta prueba** (`reset`) solo borra la sesión de ese `from`, no las de otras pestañas ni las cerradas. El `from` debe ser `sandbox-` seguido de un UUID v4 en minúsculas, como lo genera el navegador, de 44 caracteres como máximo (si no, `400 INVALID_BODY`) y el webhook de WhatsApp descarta un identificador con ese prefijo (`webhook.sandbox_id_dropped`), así un canal nunca escribe en la sesión del otro. Ojo: `chatbot.purgar_sesiones_inactivas` borra cualquier sesión inactiva, también las cerradas, si se programa; para auditarlas hay que excluir los `wa_id` que empiezan con `cerrada-`. Sin base de datos viven en memoria y vencen con el mismo plazo que el resto.
- **El texto tiene un máximo de 1000 caracteres** (`SANDBOX_TEXT_MAX_LENGTH`, el mismo de la descripción de la incidencia). La caja de texto corta lo que pase de ese largo, al escribir o al pegar, y muestra el aviso `No podemos procesar tu mensaje: reduce la cantidad de caracteres (máximo 1000).`. El servidor valida igual: `POST /api/sandbox` con un `text` más largo responde `422` con `error: "TEXT_TOO_LONG"` y ese mismo mensaje, sin correr el turno.
- **Las imágenes tienen el mismo máximo que en whatsapp-bot** (`EVIDENCE_IMAGE_MAX_MB`, 5 MB por defecto, un solo valor para los dos canales que la página recibe del servidor). El Chat-bot no envía una imagen más pesada y muestra el aviso `La imagen supera el tamaño máximo permitido (5 MB). Envía una imagen más liviana.`; el servidor aplica el mismo límite si llega una más pesada. El Chat-bot envía una imagen por turno, así que cada una recibe su propia respuesta.
- **El token de MINSA nunca sale del servidor.** `POST /api/sandbox` responde `{ sent, session: { state, slots, counters } }` y `slots` es una lista blanca (`lib/constants/sandbox-visible-slots.ts`, armada por `buildSandboxReply` en `lib/utils/sandbox-reply.ts`): el token (`citaBearer`), los identificadores del código OTP, los documentos, los nombres, los textos libres, los datos de referencias y de consultas no viajan al navegador. El navegador solo guarda `sandbox-from` en `localStorage`, con la forma `sandbox-<UUID v4>` (`crypto.randomUUID()`, o `crypto.getRandomValues` donde la página no es un contexto seguro; nunca `Math.random`): es la única identidad de la sesión del Chat-bot y no debe poder adivinarse. Siguiente paso, aún sin hacer: que el servidor la emita en una cookie `httpOnly` en lugar de `localStorage`; las claves antiguas `sandbox-session` y `sandbox-entries` se borran al abrir el Chat-bot. Una prueba falla si aparece un slot sin clasificar como visible o retirado.
- Con las integraciones en su valor por defecto (`false`), funciona sin conexión con datos de prueba fijos: DNI `12345678` (8 dígitos) o carnet de extranjería `123456789` (9 dígitos), OTP `1234`, distrito `lurigancho`. El bot pide solo el número de documento y el largo decide el tipo (`01` DNI, `03` carnet de extranjería), que viaja como `tipo_documento` a MINSA.
- Las referencias médicas tienen su propia fila, **Cita con referencia** (en los dos canales, escribir «referencia» o «cita con referencia», o un texto libre que la IA lea como un pedido de la referencia; ver [flujo-referencias.md](flujo-referencias.md)): documento, OTP, la lista de las referencias que permiten agendar y la reserva con la referencia elegida; no pide los términos. **Agendar una cita médica** ya no consulta referencias: después del OTP pide el distrito ([flujo-cita.md](flujo-cita.md)). Sin `SANDBOX_USE_REAL_MINSA=true` la consulta responde siempre «No pudimos consultar tus referencias en este momento. Inténtalo de nuevo más tarde.» y ofrece agendar una cita. La excepción son los DNI `10308523` y `47391441` del piloto comercial: tras iniciar sesión con ellos, se muestran referencias de demostración (`lib/fsm/flows/cita/steps/demo/`) en lugar de consultar MINSA; el inicio de sesión es el normal, así que necesitan un MINSA que los valide. Si la referencia elegida no tiene cupos, pregunta «¿Deseas seleccionar otra referencia?» con **Sí** / **No, salir**. La referencia que se quedó sin cupos queda marcada en la sesión y ya no aparece al volver a la lista, sin volver a consultar MINSA. La marca se borra al consultar de nuevo las referencias o al pasar a una cita nueva. Una cita duplicada con referencia sigue con una cita sin referencia. La reserva con una referencia real se recorre contra el MINSA real o en `tests/lib/fsm/core/referencia-flow.e2e.test.ts`, que inyecta las referencias. El contrato del endpoint de referencias está en [flujo-referencias.md](flujo-referencias.md#contrato-de-whatsappapiv1references).

## Notas técnicas

- **Webhook en runtime Node.js.** `app/webhook/whatsapp/route.ts` no corre en Edge porque la verificación de la firma necesita el módulo `crypto` de Node. La ruta está fija en `/webhook/whatsapp` para coincidir con la URL de callback registrada en Meta for Developers.
- **Ventana de atención de 24 horas.** Se calcula desde el **último mensaje entrante** de la conversación, no desde la actividad general.
- **Identificadores BSUID.** Los contactos de esta cuenta usan el esquema *Business-Scoped User ID* de Meta. Los webhooks traen `user_id`/`from_user_id` en lugar de `wa_id`/`from`, y los envíos deben usar `recipient` (con `recipient_type: "individual"`) en lugar de `to`: con `to`, Graph API acepta la petición pero el mensaje nunca se entrega.
- **Sin autenticación.** La aplicación no incluye login; por eso el Chat-bot está desactivado por defecto.
- **Carga diferida de Prisma.** `@prisma/client` lee el `.env` al cargarse; por eso el ejecutor importa `lib/recepcion/servicio` de forma diferida y no se carga en los turnos que no tocan la base.
