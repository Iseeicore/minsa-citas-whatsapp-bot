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
| `dba/` | Lo que corre solo un DBA, a mano (roles y permisos); ni el arranque ni `db:aplicar` ni `db:test` lo leen |

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

4. Verificar el usuario (debe salir una fila con `activo = true` y `clave_cambiada_en` vacía: la clave se cambia al primer inicio de sesión):

   ```sql
   SELECT correo, activo, clave_cambiada_en FROM gestion.usuario_interno WHERE correo = '<correo>';
   ```

Los pasos 1 y 3 se pueden repetir sin riesgo.

## Auditoría

El esquema `auditoria` guarda evidencia de solo inserción: `evento` (cada hecho de una operación), `cambio_fila` (cada alta, cambio o borrado de las tablas de negocio auditadas) y `recurso_accedido` (lo que la API entregó en una respuesta). No está en `schema.prisma`: el bot no lo lee con Prisma.

- La API de gestión registra sus eventos solo con `auditoria.registrar_evento(evento, recursos)` y declara el evento de la operación con `set_config('app.auditoria', '{"evento_id":"..."}', true)`; los cambios de fila de esa transacción se cuelgan de él.
- Las escrituras del bot también se auditan: sin `app.auditoria`, el disparador crea un evento de la conexión (`BASE_DATOS`) sin inventar un autor.
- Una operación que quedó con su evento `INICIADO` y sin cierre se cierra agregando un evento `INTERRUMPIDO` (motivo `SIN_CIERRE`), nunca borrando: lo hace `auditoria.cerrar_operaciones_interrumpidas(antigüedad, lote)`. El bot la llama al arrancar y después cada hora, con una hora de antigüedad (`lib/constants/limits/auditoria.ts`) y deja `auditoria.operaciones_interrumpidas` en el log. Tiene su propio candado, así que varias instancias o un cron de Infraestructura pueden llamarla a la vez sin cerrar dos veces. Cuánto tiempo se guarda la auditoría (retención por antigüedad o volumen) está por decidir con Infraestructura.
- Modificar, borrar o vaciar una tabla de auditoría falla con `42501`, aunque la sentencia no toque filas. PostgreSQL no impide que el dueño de las tablas o un superusuario quite el disparador: la custodia real depende de quién tiene esas cuentas.

## Roles y permisos (paso del DBA)

Hoy una sola cuenta (la de `DATABASE_URL`) es dueña de todo y migra al arrancar. Eso no cambia con este paso. `dba/roles.sql` es opcional y lo corre un DBA con un superusuario (o un usuario con `CREATEROLE` dueño de la base), indicando la cuenta que migra:

```bash
psql -v dueno=<usuario de DATABASE_URL> -f prisma/dba/roles.sql
```

Se puede repetir sin riesgo. Crea cinco roles sin inicio de sesión:

| Rol | Para qué |
|---|---|
| `chatbot_auditoria_propietario` | Dueño del esquema `auditoria`, de sus tablas y funciones. Nadie inicia sesión con él |
| `chatbot_auditoria_ingesta` | Solo ejecuta `auditoria.registrar_evento`; no escribe directo en las tablas ni las lee |
| `chatbot_auditoria_lector` | Solo consulta las tablas de `auditoria` |
| `chatbot_app_crud` | Lee y escribe las tablas de `catalogo`, `chatbot`, `gestion` e `ia`, usa sus secuencias y ejecuta sus funciones; incluye la ingesta de auditoría |
| `chatbot_app_admin` | Lo mismo que `chatbot_app_crud`, con opción de delegarlo (`WITH GRANT OPTION`); no es dueño, superusuario ni crea roles |

Los usuarios con inicio de sesión los crea el DBA, uno por persona o servicio, dentro de un rol de grupo:

```sql
CREATE ROLE <usuario_api> LOGIN PASSWORD '<clave generada>' IN ROLE chatbot_app_crud;
CREATE ROLE <usuario_consulta> LOGIN PASSWORD '<clave generada>' IN ROLE chatbot_auditoria_lector;
CREATE ROLE <usuario_admin> LOGIN PASSWORD '<clave generada>' IN ROLE chatbot_app_admin;
```

Lo que pide la entrega de la API de gestión, frente a lo que hay hoy:

| Pide | Hoy |
|---|---|
| Ninguna cuenta de aplicación es dueña de las tablas ni miembro del propietario de auditoría | La cuenta de `DATABASE_URL` es dueña de todo: crea las tablas al migrar y reemplaza funciones y disparadores en cada arranque |
| La API escribe auditoría solo por `registrar_evento` (rol de ingesta) | Cualquier conexión puede ejecutar `registrar_evento` mientras no se corra este script |
| La consulta de auditoría es de solo lectura (rol lector) | No hay cuenta de solo lectura |
| La API necesita `SELECT, INSERT, UPDATE` sobre `gestion.control_acceso_clave` | Lo tiene por ser dueña; con `chatbot_app_crud` también |

Qué cambia para los usuarios que ya existen si se adopta:

- La cuenta que migra (`dueno`) pasa a ser miembro de `chatbot_auditoria_propietario`. Es necesario: sin eso, `db:aplicar` no puede reemplazar las funciones ni los disparadores de `auditoria` y el arranque falla. Sigue siendo dueña de las demás tablas.
- `PUBLIC` pierde el acceso al esquema `auditoria` y la ejecución de sus funciones. Los disparadores siguen funcionando para cualquier usuario: no necesitan ese permiso.
- Una cuenta que hoy usa la base sin ser la dueña deja de poder ejecutar `registrar_evento` hasta que se le dé `chatbot_app_crud` o `chatbot_auditoria_ingesta`.

Camino recomendado:

1. Ahora: correr `dba/roles.sql` y crear la cuenta de solo lectura de auditoría. No cambia el arranque.
2. Después, con aviso a Infraestructura: separar la cuenta que migra (dueña, la del arranque) de la cuenta con la que la aplicación atiende (`chatbot_app_crud`). Eso exige que el arranque use una URL para migrar y otra para atender; hoy el código usa una sola, así que es un cambio de código y de despliegue aparte.
3. La API de gestión usa su propia cuenta en `chatbot_app_crud`; nunca la del propietario.

Una base donde ya se corrió el migrador propio de la API de gestión (`database/aplicar.mjs`, con la tabla `gestion.migracion_denuncias` y disparadores `trg_*denuncias*`) no se adapta: sus objetos de auditoría tienen otro dueño y duplicarían la auditoría. Es una base de prueba: se borra y se arma de nuevo.

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
