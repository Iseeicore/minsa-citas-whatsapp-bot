# Bot de citas MINSA

Bot de WhatsApp (whatsapp-bot) y de chat web (Chat-bot) que atiende a la ciudadanía para agendar citas médicas en el MINSA, consultar referencias y, con la bandera, registrar y consultar incidencias. Está hecho con Next.js, Prisma y PostgreSQL, y se despliega con Docker. El detalle para infraestructura está en [docs/despliegue-minsa.md](docs/despliegue-minsa.md) y el de desarrollo en [docs/desarrollo.md](docs/desarrollo.md).

## Requisitos

- Docker
- PostgreSQL 16, con las extensiones `pg_trgm` y `unaccent` (paquete `contrib`)
- La imagen se construye con Node.js 22 dentro; el servidor no necesita Node.js

## Variables de entorno

Crea un archivo `.env` en la raíz, junto a `docker-compose.yml`, con este contenido:

```bash
# Base de datos
DATABASE_ENABLED=true
DATABASE_URL=

# MINSA
MINSA_API_HOST=
MINSA_INTEGRATION_SECRET=
MINSA_CONVERSATION_ID_PLACEHOLDER=
MINSA_DIGITAL_APP_URL=
SANDBOX_USE_REAL_MINSA=true
CITA_ALLOWED_DEPARTAMENTOS=LIMA

# WhatsApp (Meta)
META_APP_SECRET=
META_WEBHOOK_VERIFY_TOKEN=
META_ACCESS_TOKEN=
META_PHONE_NUMBER_ID=
META_GRAPH_API_VERSION=v21.0

# IA
AI_PROVIDER=gemini
GOOGLE_CLIENT_API=
GOOGLE_AI_MODEL=gemini-3.6-flash
SANDBOX_USE_REAL_AI=true

# Chat-bot (Sandbox)
SANDBOX_ENABLED=true
SANDBOX_ALLOWED_ORIGINS=
SANDBOX_SHARED_SECRET=
SANDBOX_PAGE_ENABLED=

# Banderas
INCIDENCIAS_ENABLED=false
TERMINOS_ENABLED=false
TERMINOS_URL=

# Imágenes de evidencia
EVIDENCE_IMAGE_MAX_MB=5
MEDIA_STORAGE_BASE_URL=
MEDIA_STORAGE_TOKEN=
MEDIA_STORAGE_TIMEOUT_MS=10000

# Logs
LOG_LEVEL=info
LOG_TO_FILE=false
LOG_DIR=logs

# Perímetro, candado de turno y puerto publicado (opcionales)
INBOUND_RATE_LIMIT=
TURN_PROCESS_LOCK_TIMEOUT_MS=30000
TURN_LOCK_TIMEOUT_MS=10000
TURN_LOCK_MAX_CONCURRENCY=4
TURN_DB_LOCK=
HOST_PORT=3000
```

Llena los valores vacíos según el ambiente donde se despliegue; una variable vacía equivale a no definirla. Qué hace cada una, su valor por defecto y su rango están en [docs/despliegue-minsa.md](docs/despliegue-minsa.md#36-referencia-de-todas-las-variables).

Para usar la base de datos se necesitan `DATABASE_ENABLED=true` y `DATABASE_URL`. Con `DATABASE_ENABLED=false` el servicio arranca sin base de datos y sin aplicar migraciones: la conversación vive en memoria y las incidencias no se guardan. En producción deja `SANDBOX_PAGE_ENABLED` sin definir (abre la bandeja web sin autenticación) y define `SANDBOX_SHARED_SECRET` para que solo el servidor del portal pueda llamar al Chat-bot.

## Despliegue con pocos pasos

1. Definir las variables de entorno de la sección anterior. Si falta una de las 4 credenciales de Meta o `MINSA_DIGITAL_APP_URL`, Docker Compose se detiene y la nombra.

2. Construir la imagen y levantar el contenedor, esperando a que el healthcheck lo marque sano (máximo 180 s):

   ```bash
   docker compose up -d --build --wait --wait-timeout 180
   ```

   Con Node.js instalado, `npm run docker:up` hace lo mismo; `docker compose logs -f` muestra los logs y `docker compose down` lo detiene.

3. Al arrancar, el contenedor aplica las migraciones pendientes (`prisma migrate deploy`), luego las funciones, los disparadores, los comentarios y las semillas de catálogo (`prisma/sql` y `prisma/seeds/catalogos`) y después inicia el servicio. Si fallan, el log muestra el código de Prisma (P3005, P3009 o P3018) con el siguiente paso, y el contenedor no se inicia.

4. Solo la primera vez: un DBA hace la carga inicial (hospitales y usuario administrador) con los pasos de [`prisma/README.md`](prisma/README.md#carga-inicial).

5. Comprobar que responde (puerto 3000, o `HOST_PORT`) y registrar en Meta for Developers la URL de callback `https://<servidor>/webhook/whatsapp` (el HTTPS lo termina el proxy inverso del servidor):

   ```bash
   curl http://localhost:3000/api/health
   ```

## Borrar la base y migrar desde cero

`RESET_DATABASE_CONFIRM` **borra datos**. Si vale lo mismo que el nombre de la base de `DATABASE_URL`, el arranque borra los esquemas `auditoria`, `catalogo`, `chatbot`, `gestion` e `ia`, las funciones `fn_*` de `public` y el historial de migraciones, y después migra desde cero. Si no coincide, no borra nada y el contenedor no se inicia. Con la variable puesta, cada reinicio vuelve a borrar todo: se usa una sola vez y se quita antes del siguiente arranque. Detalle en [docs/despliegue-minsa.md](docs/despliegue-minsa.md#92-borrar-la-base-y-migrar-desde-cero).

## Documentación

- [docs/despliegue-minsa.md](docs/despliegue-minsa.md): base de datos, todas las variables, imagen Docker, arranque y comprobaciones para infraestructura
- [docs/desarrollo.md](docs/desarrollo.md): canales, desarrollo local, modos de persistencia, estructura, pruebas (`npm run test:coverage` mide la cobertura), hook de pre-commit y notas técnicas
- [prisma/README.md](prisma/README.md): migraciones, SQL, carga inicial y cómo se cambia una regla de la base
- [docs/flujo-cita.md](docs/flujo-cita.md), [docs/flujo-referencias.md](docs/flujo-referencias.md) y [docs/flujo-incidencia.md](docs/flujo-incidencia.md): los flujos de la conversación
- [docs/observabilidad.md](docs/observabilidad.md) y [docs/ci.md](docs/ci.md): logs, trazas y enmascarado; qué comprueba el CI (con los umbrales de cobertura) y la regla de `main`
- [docs/brechas-tecnicas.md](docs/brechas-tecnicas.md) y [docs/canales-fuera-de-alcance.md](docs/canales-fuera-de-alcance.md): pendientes abiertos
- [docs/qa/guia-pruebas-manuales.md](docs/qa/guia-pruebas-manuales.md): casos de prueba manual
