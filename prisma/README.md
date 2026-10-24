# Base de datos: migraciones, SQL y carga inicial

PostgreSQL 16. Cada cosa vive en un solo sitio:

| Carpeta | Qué lleva |
|---|---|
| `schema.prisma` | Tablas, columnas, índices y llaves que conoce Prisma |
| `migrations/` | Solo estructura: tablas, columnas, índices y restricciones |
| `sql/functions/` | Una función por archivo (`CREATE OR REPLACE FUNCTION`) |
| `sql/triggers/` | Los disparadores, agrupados por la función que llaman |
| `sql/comentarios.sql` | Descripción de esquemas, tablas y columnas; lo genera `npm run db:diccionario` |
| `seeds/catalogos/` | Datos de referencia que el sistema necesita (estados, motivos, categorías con sus plazos, roles) |
| `seeds/eess/`, `seeds/dev/` | Padrón completo y datos de desarrollo; no van en la imagen |
| `tests/` | Pruebas SQL |

El diccionario de datos está en `docs/base-de-datos/`.

## Instalación

El contenedor ejecuta los pasos 1 y 2 al arrancar, en ese orden. Se pueden repetir sin riesgo.

1. Aplicar las migraciones pendientes:

   ```bash
   npx prisma migrate deploy
   ```

2. Aplicar las funciones, los disparadores, los comentarios y las semillas de catálogo:

   ```bash
   npm run db:aplicar
   ```

   Corre en una sola transacción: si algo falla, no cambia nada.

3. Si el arranque falla con P3005, P3009 o P3018, `scripts/docker-entrypoint.sh` indica la migración y el siguiente paso. Resolverla (`prisma migrate resolve`) lo decide una persona después de leer la columna `logs` de `_prisma_migrations`.

Una base creada con migraciones anteriores a este esquema no se actualiza: Infraestructura la elimina y crea una nueva y vacía.

## Carga inicial

La ejecuta un DBA con el usuario dueño de la base, una sola vez, después de que el contenedor arrancó. Ni las migraciones ni el arranque la ejecutan.

1. Cargar los hospitales de la primera etapa:

   ```sql
   SELECT catalogo.cargar_hospitales_fase_1();
   ```

2. Verificar que quedaron los 4 hospitales (deben salir 4 filas):

   ```sql
   SELECT codigo_renipress, nombre FROM catalogo.establecimiento_salud WHERE codigo_renipress IN ('6206', '5946', '6215', '33381');
   ```

3. Crear el usuario administrador con su correo y la huella Argon2id de su clave. La huella se genera fuera de la base; la clave nunca se envía:

   ```sql
   SELECT gestion.crear_administrador('<correo>', '<huella Argon2id>', 'Administrador');
   ```

   Resultado esperado: `1`. Devuelve `0` si el correo ya existía y no cambia nada. Falla si no se hizo el paso 1.

4. Verificar el usuario (debe salir una fila con `activo = true`):

   ```sql
   SELECT correo, activo FROM gestion.usuario_interno WHERE correo = '<correo>';
   ```

Los pasos 1 y 3 se pueden repetir sin riesgo.

## ¿Cómo se cambia una regla de negocio de la base?

Nunca se manda la query a mano con `psql` ni se edita una migración ya aplicada (cambia su checksum). Cada cosa se cambia en su archivo y se despliega:

| Qué cambia | Dónde |
|---|---|
| El cuerpo de una función | Su archivo en `sql/functions/` |
| Un tope, un mínimo o un día de una regla | Es un argumento del disparador (`sql/triggers/<función>.sql`) o un parámetro de la función; nunca va escrito dentro del cuerpo |
| Un valor de catálogo (por ejemplo el plazo de una categoría) | Su archivo en `seeds/catalogos/` |
| Una tabla, columna, índice o restricción | Una migración nueva: `npx prisma migrate dev --create-only --name <que_cambia>` |
| La firma de una función, o quitarle un valor por defecto | Una migración nueva con `DROP FUNCTION IF EXISTS <firma anterior>`; después se edita el archivo |

Pasos:

1. Editar el archivo, o crear la migración.
2. Actualizar la prueba de `tests/` que cubre esa regla y correr `npm run db:test`.
3. Desplegar. El arranque aplica los cambios.
4. Confirmar la definición vigente de una función; debe salir la versión nueva:

   ```sql
   SELECT pg_get_functiondef('catalogo.sumar_dias_habiles(timestamptz, integer)'::regprocedure);
   ```

## Mantenimiento

- Toda tabla y columna nueva lleva su descripción en `docs/base-de-datos/diccionario.json`; `npm run db:diccionario` regenera `sql/comentarios.sql`.
- Un rol o un valor de catálogo no se borra: se retira con `activo = false`.
- La purga de sesiones (`chatbot.purgar_sesiones_inactivas`) la programa Infraestructura (`pg_cron` o el cron del servidor); hoy nadie la llama.

| Comando | Qué hace |
|---|---|
| `npx prisma migrate deploy` | Aplica las migraciones pendientes |
| `npm run db:aplicar` | Aplica `sql/` y `seeds/catalogos/` |
| `npm run db:test` | Arma una base desechable con todo lo anterior y corre `tests/` (necesita `psql`) |
| `npm run db:diccionario` | Regenera el diccionario y `sql/comentarios.sql` (necesita `psql` y `DATABASE_URL`) |
| `npm run smoke:postgres` | Pruebas de humo con Prisma Client contra una base armada |
