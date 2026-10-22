# Bot de citas MINSA

Bot de WhatsApp que atiende a la ciudadanía para agendar citas médicas en el MINSA. Está hecho con Next.js, Prisma y PostgreSQL, y se despliega con Docker.

En WhatsApp y en el Chat-bot web, **Agendar una cita médica** consulta las referencias después de validar documento y OTP. Si MINSA devuelve referencias, ofrece **Nueva cita** o **Cita con referencia** antes de buscar distrito, especialidad o establecimiento. Elegir una referencia válida lleva directamente a sus fechas y horarios, sin preguntar «¿Es esta tu referencia?». El establecimiento y la especialidad quedan fijos por sus códigos IPRESS y UPS originales. Sólo se ofrecen fechas y horarios con cupos mayores que cero y se confirma el resumen final antes de reservar. Si la consulta está vacía continúa la cita nueva; si falla permite reintentar o elegir voluntariamente una nueva cita.

**Cambiar referencia** permite volver al listado desde fechas, horarios, la elección de otra fecha o el resumen final en ambos canales. Retira la selección y disponibilidad anteriores y conserva la identidad verificada. La paginación y esta acción forman parte de la misma interacción que la lista. Si la sesión venció, primero se solicita otro OTP y después se recuperan las referencias. Cuando una referencia no tiene fechas con cupos, pregunta «No encontramos cupos disponibles para esta referencia. ¿Deseas seleccionar otra referencia?»: **Sí** recupera sus referencias y **No** utiliza la despedida existente y cierra la sesión. No muestra el listado ni consulta otra disponibilidad antes de responder. La falta de horarios de un día permite otra fecha o referencia. Los fallos técnicos se informan como errores, sin presentarlos como ausencia de cupos. Las demos conservan sus pasos anteriores.

La consulta de referencias envía el token de sesión obtenido tras el OTP en `Authorization: Bearer`, mediante el mismo cliente autenticado de fechas, horarios y reservas. Al verificar de nuevo se usa el token renovado.

MINSA devuelve las referencias como un arreglo en la raíz del JSON. El adaptador valida ese arreglo, conserva los identificadores y códigos originales y convierte el resultado al contrato interno del bot: referencias disponibles, colección vacía o error. No se exige un campo externo `status_reference`.

El chat web presenta tarjetas con la especialidad o atención primero y los datos completos de número, estado, destino, origen y fecha de referencia. Los nombres largos se distribuyen en varias líneas; la búsqueda también incluye esos datos completos. Una descripción de especialidad ausente se muestra como «Especialidad no informada».

WhatsApp destaca la especialidad en un título de hasta 24 caracteres, con una descripción de hasta 72. Referencias y disponibilidad se paginan en grupos de 7 opciones; navegación y **Cambiar referencia** se integran como filas de la misma lista Graph, hasta 10 filas en total. El resumen final conserva un máximo de 3 botones. Si Meta rechaza una interacción con HTTP 400, el respaldo de texto conserva los títulos de página y cambio sin numerarlos como opciones reservables; se pueden escribir para continuar.

Se conserva el criterio del servicio MINSA: no se agregan filtros por estado de la referencia. **Consultar Referencias** mantiene su entrada. Esta entrega amplía expresamente WhatsApp para compartir el flujo web; la migración Python se adapta en su directorio independiente. No se cambian esquemas ni migraciones, y las pruebas sustituyen MINSA y Graph sin hacer reservas ni enviar mensajes reales. Detalles y casos: [flujo de cita](docs/flujo-cita.md), [referencias](docs/flujo-referencias.md) y [pruebas manuales](docs/qa/guia-pruebas-manuales.md).

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
