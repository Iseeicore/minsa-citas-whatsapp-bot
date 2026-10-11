# Despliegue en MINSA: base de datos, variables y comprobaciones

Para infraestructura. Resume lo que hay que preparar para desplegar la imagen Docker del bot con incidencias. Las instrucciones generales de la imagen están en el [README](../README.md#ejecutar-con-docker-servidor-minsa).

## 1. Qué cambió respecto al despliegue anterior

- **Las incidencias se guardan en PostgreSQL.** Hace falta `DATABASE_ENABLED=true` y `DATABASE_URL`.
- **Las migraciones se reescribieron.** Una base creada con la versión anterior no se actualiza: hay que usar una base **nueva y vacía**.
- **Las páginas del Sandbox quedan ocultas y la bandeja web, cerrada**, salvo que se defina `SANDBOX_PAGE_ENABLED=true`. `POST /api/sandbox`, que usa el portal de MINSA Digital, no cambia.
- **La imagen sigue sin credenciales dentro.** Todo entra por variables de entorno.

## 2. Requisitos de la base (PostgreSQL 16)

- Una base **vacía**, con un usuario que sea su **dueño** y **no sea superusuario**. Debe poder crear esquemas, tablas, funciones y disparadores. Si la base no existe, el usuario necesita `CREATEDB` para que el contenedor la cree; si no, créenla antes con `CREATE DATABASE <base> OWNER <usuario>`.
- El paquete **`contrib`** de PostgreSQL, que trae las extensiones `pg_trgm` y `unaccent`. Comprobación, que debe devolver las dos filas:

  ```sql
  SELECT name FROM pg_available_extensions WHERE name IN ('pg_trgm','unaccent');
  ```

- **`uuidv7()`:** PostgreSQL 16 no la trae. La migración inicial la crea en `public` solo si el servidor no la tiene. Con PostgreSQL 18 se usa la nativa.
- Si la clave tiene caracteres especiales (`@ : / ? #`), van codificados en la URL.
- **Recomendado:** `ALTER DATABASE <base> SET jit = off;`. La base la comparte el backend de incidencias; en sus consultas de la bandeja, con JIT apagado una pasó de 926 ms a 255 ms. No se midió con las consultas del bot.
- Probado: las 9 migraciones se aplican enteras en PostgreSQL 16.15 con un usuario que no es superusuario.

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

Sin cambios. Los secretos se completan en el servidor. `SANDBOX_USE_REAL_*` no es solo del sandbox: activa la IA, MINSA y RENIEC en todo el bot, y en producción debe estar en `true` para lo que se use.

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
MEDIA_STORAGE_BASE_URL=
MEDIA_STORAGE_TOKEN=
MEDIA_STORAGE_TIMEOUT_MS=
LOG_LEVEL=info
LOG_TO_FILE=false
```

| Variable | Para qué sirve | Sin definir |
|---|---|---|
| `SANDBOX_PAGE_ENABLED` | `true` muestra `/sandbox` y `/configuracion-visor-sandbox` y **abre la bandeja web** (`/api/conversations*`, `/api/messages/send`), que no tiene autenticación | Las páginas redirigen a `/api/health` y las rutas de la bandeja responden 404. **En producción, déjenla sin definir** |
| `MEDIA_STORAGE_BASE_URL` | Servicio donde se guarda la foto de evidencia de una incidencia | La foto se recibe pero no se guarda, y queda un aviso en el log |
| `MEDIA_STORAGE_TOKEN` | Credencial de ese servicio, si la pide | Sin credencial |
| `MEDIA_STORAGE_TIMEOUT_MS` | Tiempo máximo de espera de ese servicio | 10 000 ms |
| `LOG_LEVEL` | Nivel de logs: `info`, `warn`, `error` o `silent` | `info` |
| `LOG_TO_FILE` | `true` además escribe los logs en archivos | Solo consola, lo adecuado para Docker |

Hay otras opcionales (`INBOUND_RATE_LIMIT`, `TURN_DB_LOCK`, `TURN_LOCK_TIMEOUT_MS`, `TURN_LOCK_MAX_CONCURRENCY`, `TURN_PROCESS_LOCK_TIMEOUT_MS`, `LOG_DIR`). Vacías o sin definir valen lo mismo; no hace falta incluirlas. Un `0` no desactiva nada: vuelve al valor por defecto.

### 3.4 No definir, salvo indicación expresa

| Variable | Por qué |
|---|---|
| `RESET_DATABASE_CONFIRM` | **Destructiva.** Si vale lo mismo que el nombre de la base, el arranque borra todos los esquemas y migra desde cero. Con la variable puesta, **cada reinicio vuelve a borrar todo**. Se usa una sola vez y se quita antes del siguiente arranque. Ver el [README](../README.md#borrar-la-base-y-migrar-desde-cero) |
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
| Incidencias | `DATABASE_ENABLED=true` y `DATABASE_URL` | No se guardan |
| Portal de MINSA Digital | `SANDBOX_ENABLED=true` y `SANDBOX_ALLOWED_ORIGINS` | `POST /api/sandbox` responde 404 |

## 5. Despliegue

1. Crear la base según la sección 2.
2. Preparar el `.env` con las variables de la sección 3, junto a `docker-compose.yml`.
3. Construir y levantar la imagen (`npm run docker:up`, o el procedimiento propio de infraestructura sobre el mismo `Dockerfile`).
4. El contenedor aplica las migraciones al arrancar. En el log aparecen mensajes `[entrypoint]`; el último, si todo salió bien, es `Migraciones al día. Iniciando el servicio.` Si fallan, el contenedor se detiene con un mensaje que indica qué revisar.

## 6. Comprobaciones posteriores

| Comprobación | Resultado esperado |
|---|---|
| `GET /api/health` | `{"status":"ok","database":"enabled"}`. Con `degraded`, el campo `config` lista los códigos de lo que está mal. No consulta la base ni las credenciales de Meta |
| `GET /sandbox` y `GET /configuracion-visor-sandbox` | Redirigen (307) a `/api/health` |
| `GET /api/conversations` | `404` |
| `GET /webhook/whatsapp` sin los parámetros de Meta | `403` |
| Tabla `public._prisma_migrations` | 9 filas con `finished_at` |
| `POST /api/sandbox` desde el origen del portal | Responde, con la cabecera CORS del origen permitido |

## 7. RENIEC

`RENIEC_LOOKUP_BASE_URL` y `SANDBOX_USE_REAL_RENIEC` activan la consulta del nombre por DNI en el flujo de incidencias. Ese servicio es de un tercero, no de MINSA.

- **Qué se envía:** el número de DNI, dentro de la URL de la consulta.
- **Sin RENIEC:** el flujo **no se detiene**. El bot pide un nombre o alias, y la incidencia se guarda con el DNI tal como se escribió, sin verificar. Solo el DNI de prueba `12345678` devuelve un nombre.
- **Para producción en MINSA:** quitar ambas variables.
- **Para una demostración:** puede dejarse activa de forma temporal, con la justificación que corresponda a MINSA.
