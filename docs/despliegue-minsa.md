# Despliegue en MINSA: base de datos, variables y comprobaciones

Para infraestructura. Resume lo que hay que preparar para desplegar la imagen Docker del bot con incidencias (apagadas por defecto: ver `INCIDENCIAS_ENABLED` en la sección 3.3). Las instrucciones generales de la imagen están en el [README](../README.md#ejecutar-con-docker-servidor-minsa).

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

| Variable | Para qué sirve | Si falta |
|---|---|---|
| `DATABASE_ENABLED` | Activa la base. El compose la toma como `false` si no está definida | Las incidencias **no se pueden guardar** |
| `DATABASE_URL` | Conexión a PostgreSQL. Con la base activa, el contenedor aplica las migraciones pendientes al arrancar | El contenedor **se detiene** con un error |
| `MINSA_DIGITAL_APP_URL` | Origen de MINSA Digital para armar `Origin` y `Referer` y los enlaces de los avisos | Con `SANDBOX_USE_REAL_MINSA=true`, las llamadas autenticadas a MINSA responden 503 y `/api/health` marca `degraded` |

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

| Variable | Para qué sirve | Sin definir |
|---|---|---|
| `SANDBOX_SHARED_SECRET` | Valor aleatorio largo (32 bytes) compartido con el servidor del portal, que firma cada llamada a `POST /api/sandbox`. Con él definido, sin firma válida responde 401 | Sin firma: cualquiera que conozca la URL puede llamar a la ruta con `curl`. Debe ser distinto de los demás secretos |
| `SANDBOX_PAGE_ENABLED` | `true` muestra `/sandbox` y `/configuracion-visor-sandbox` y **abre la bandeja web** (`/api/conversations*`, `/api/messages/send`), que no tiene autenticación | Las páginas redirigen a `/api/health` y las rutas de la bandeja responden 404. **En producción, déjenla sin definir** |
| `INCIDENCIAS_ENABLED` | `true` (sin distinguir mayúsculas ni espacios) ofrece en el menú **Registrar una incidencia** y **Consultar una incidencia** (whatsapp-bot y Chat-bot) | Apagada: solo queda **Agendar una cita médica**; vacía o con cualquier otro valor equivale a sin definir. Las incidencias no se ofrecen ni se pueden alcanzar escribiendo `2`, `3`, `incidencia` o un código `MINSA-AAAA-NNNNNN` (o `MINSA-AAAA-A-NNNNNN`). **Para usar incidencias, pónganla en `true`** |
| `TERMINOS_ENABLED` | `true` (sin distinguir mayúsculas ni espacios) muestra los términos y condiciones antes de agendar una cita médica, en whatsapp-bot y en el Chat-bot | Apagada: la cita empieza como antes, sin términos. Se lee en cada mensaje: cambiarla exige reiniciar el proceso, no recompilar |
| `TERMINOS_URL` | Página de los términos que enlaza el botón **Ver términos** de whatsapp-bot; el bot la publica en `/terminos` | Sin enlace: whatsapp-bot muestra solo **Acepto** y **No acepto**, y queda el aviso `terminos.url_missing` en el log |
| `MEDIA_STORAGE_BASE_URL` | Servicio donde se guarda la foto de evidencia de una incidencia | La foto se recibe pero no se guarda, y queda un aviso en el log |
| `MEDIA_STORAGE_TOKEN` | Credencial de ese servicio, si la pide | Sin credencial |
| `MEDIA_STORAGE_TIMEOUT_MS` | Tiempo máximo de espera de ese servicio | 10 000 ms |
| `EVIDENCE_IMAGE_MAX_MB` | Peso máximo de cada imagen de evidencia de una denuncia, en MB, entero de 1 a 5 (Meta no admite imágenes de más de 5 MB) | 5 MB. Un valor fuera de rango se ignora y `/api/health` marca `degraded` |
| `LOG_LEVEL` | Nivel de logs: `info`, `warn`, `error` o `silent` | `info` |
| `LOG_TO_FILE` | `true` además escribe los logs en archivos | Solo consola, lo adecuado para Docker |

Hay otras opcionales (`INBOUND_RATE_LIMIT`, `TURN_DB_LOCK`, `TURN_LOCK_TIMEOUT_MS`, `TURN_LOCK_MAX_CONCURRENCY`, `TURN_PROCESS_LOCK_TIMEOUT_MS`, `LOG_DIR`). Vacías o sin definir valen lo mismo; no hace falta incluirlas. Un `0` no desactiva nada: vuelve al valor por defecto.

### 3.4 No definir, salvo indicación expresa

| Variable | Por qué |
|---|---|
| `RESET_DATABASE_CONFIRM` | **Destructiva.** Si vale lo mismo que el nombre de la base, el arranque borra todos los esquemas y migra desde cero. Con la variable puesta, **cada reinicio vuelve a borrar todo**. Solo funciona si el esquema `public` no tiene tablas ajenas a Prisma; si las tiene, tras borrar las migraciones fallan (P3005) y la base queda sin esquemas. Se usa una sola vez y se quita antes del siguiente arranque. Ver el [README](../README.md#borrar-la-base-y-migrar-desde-cero) |
| `SANDBOX_PAGE_ENABLED=true` | Abre una bandeja sin autenticación |
| `INBOUND_RATE_LIMIT=off` y `TURN_DB_LOCK=off` | Quitan la protección contra ráfagas de mensajes y contra procesar dos veces un mismo turno |

### 3.5 Una variable que este código no lee

`WEBHOOK_CHANNEL_SECRET` aparece en el ambiente, pero **ningún archivo de este repositorio la lee**. Confirmen qué componente la usa. Si es de otro sistema, déjenla; si no la usa nadie, pueden quitarla.

## 4. Qué enciende cada función

| Función | Variables | Si faltan |
|---|---|---|
| WhatsApp | las 4 `META_*` | El compose se detiene y nombra la que falta |
| Citas con datos reales | `SANDBOX_USE_REAL_MINSA=true`, `MINSA_API_HOST`, `MINSA_INTEGRATION_SECRET`, `MINSA_DIGITAL_APP_URL` | Datos simulados |
| IA del bot | `SANDBOX_USE_REAL_AI=true` y `GOOGLE_CLIENT_API` | Respuestas fijas; no entiende texto libre ni distritos mal escritos |
| Cita con referencia | `SANDBOX_USE_REAL_MINSA=true`, `MINSA_API_HOST`, `MINSA_INTEGRATION_SECRET`, `MINSA_DIGITAL_APP_URL` y que el backend de MINSA publique `/whatsapp/api/v1/references`. No lleva bandera ni variable nueva | Siempre responde «No cuentas con referencias registradas.» y ofrece agendar una cita. Los DNI de demostración `10308523` y `47391441` son la excepción, solo en este servicio |
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
