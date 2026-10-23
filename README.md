# Bot de citas MINSA

Bot de WhatsApp que atiende a la ciudadanía para agendar citas médicas en el MINSA. Está hecho con Next.js, Prisma y PostgreSQL, y se despliega con Docker. El detalle para infraestructura está en [docs/despliegue-minsa.md](docs/despliegue-minsa.md).

## Requisitos

- Docker
- PostgreSQL 16, con las extensiones `pg_trgm` y `unaccent` (paquete `contrib`)
- La imagen se construye con Node.js 22 dentro; el servidor no necesita Node.js

## Variables de entorno

Crea un archivo `.env` en la raíz con este contenido:

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
CITA_ALLOWED_DEPARTAMENTOS=

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

# Sandbox
SANDBOX_ENABLED=true
SANDBOX_ALLOWED_ORIGINS=

# Banderas
INCIDENCIAS_ENABLED=false
```

Llena los valores vacíos según el ambiente donde se despliegue.

Para usar la base de datos se necesitan `DATABASE_ENABLED=true` y `DATABASE_URL`. Con `DATABASE_ENABLED=false` el servicio arranca sin base de datos y sin aplicar migraciones: la conversación vive en memoria y las incidencias no se guardan.

## Despliegue con pocos pasos

1. Construir la imagen:

   ```bash
   docker build -t minsa-citas-whatsapp-bot .
   ```

2. Definir las variables de entorno de la sección anterior.

3. Levantar el contenedor:

   ```bash
   docker run -d --name minsa-citas-whatsapp-bot --env-file .env -p 3000:3000 minsa-citas-whatsapp-bot
   ```

   Al arrancar, el contenedor aplica las migraciones pendientes (`prisma migrate deploy`), luego las funciones, los disparadores, los comentarios y las semillas de catálogo (`prisma/sql` y `prisma/seeds/catalogos`) y después inicia el servicio. Si fallan, el log muestra el código de Prisma (P3005, P3009 o P3018) con el siguiente paso, y el contenedor no se inicia.

4. Solo la primera vez: un DBA hace la carga inicial (hospitales y usuario administrador) con los pasos de [`prisma/README.md`](prisma/README.md#carga-inicial).

5. Comprobar que responde (puerto 3000):

   ```bash
   curl http://localhost:3000/api/health
   ```

## Borrar la base y migrar desde cero

`RESET_DATABASE_CONFIRM` **borra datos**. Si vale lo mismo que el nombre de la base de `DATABASE_URL`, el arranque borra los esquemas `catalogo`, `chatbot`, `gestion` e `ia`, las funciones `fn_*` de `public` y el historial de migraciones, y después migra desde cero. Si no coincide, no borra nada y el contenedor no se inicia. Con la variable puesta, cada reinicio vuelve a borrar todo: se usa una sola vez y se quita antes del siguiente arranque.
