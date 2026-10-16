# Bot de citas MINSA

Bot de WhatsApp que atiende a la ciudadanía para agendar citas médicas en el MINSA. Está hecho con Next.js, Prisma y PostgreSQL, y se despliega con Docker.

## Requisitos previos

- Node.js 22
- PostgreSQL 16 o 18, con las extensiones `pg_trgm` y `unaccent` (paquete `contrib`)
- Docker y Docker Compose (opcional, para el despliegue en contenedor)

## Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd <carpeta-del-repositorio>
```

## Instalar dependencias

```bash
npm ci
```

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

## Aplicar migraciones

```bash
npx prisma migrate deploy
```

## Cargar datos iniciales

En el servidor de MINSA no corre ninguna semilla. Los 4 hospitales de la primera etapa los carga un DBA con:

```sql
SELECT catalogo.cargar_hospitales_fase_1();
```

Solo para desarrollo local (bases cuyo nombre termina en `_desechable`, `_dev` o `_local`):

```bash
npm run db:seed:eess
```

## Levantar el servidor

En desarrollo:

```bash
npm run dev
```

Con Docker (construye la imagen, levanta el contenedor y espera a que esté sano):

```bash
npm run docker:up
```

Comprobar que responde:

```bash
curl http://localhost:3000/api/health
```

## Ambiente de desarrollo

Pruebas:

```bash
npm test
```

Linter:

```bash
npm run lint
```

Formato:

```bash
npm run format
npm run format:check
```

Tipos:

```bash
npx tsc --noEmit
```

Flujo del bot de citas: [docs/flujo-cita.md](docs/flujo-cita.md)
