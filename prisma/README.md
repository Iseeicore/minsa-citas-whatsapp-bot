# Base de datos: migraciones, SQL y carga inicial

PostgreSQL 16. Cada cosa vive en un solo sitio:

| Carpeta | Qué lleva |
|---|---|
| `schema.prisma` | Tablas, columnas, índices y llaves que conoce Prisma |
| `migrations/` | Solo estructura: tablas, columnas, índices y restricciones |
| `sql/functions/` | Una función por archivo (`CREATE OR REPLACE FUNCTION`) |
| `sql/triggers/` | Los disparadores, agrupados por la función que llaman |
| `sql/comentarios.sql` | Descripción (`COMMENT ON`) de esquemas, tablas, columnas y llaves foráneas; se edita a mano y es la única fuente |
| `seeds/catalogos/` | Datos de referencia que el sistema necesita (estados, motivos, categorías con sus plazos, roles) |
| `seeds/eess/`, `seeds/dev/` | Padrón de establecimientos (`seeds/eess/establecimientos.sql`: los 434 de Lima y la carga en un solo archivo, que también carga un CSV completo) y datos de desarrollo; no van en la imagen |
| `tests/` | Pruebas SQL |
| `dba/` | Lo que corre solo un DBA, a mano (roles y permisos); ni el arranque ni `db:aplicar` ni `db:test` lo leen |

La documentación de la base es la propia base: los `COMMENT ON` de `sql/comentarios.sql` y de cada función. No se mantiene un diccionario en Markdown; para leerla se consulta el catálogo (`obj_description`, `col_description`) de una base ya aplicada.

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

## Padrón de establecimientos

`npm run db:seed:eess` carga el padrón con `seeds/eess/establecimientos.sql`, en una sola transacción: si una fila no pasa la validación, no cambia nada. Repetir la misma carga no crea filas ni sube `version_fila`. Nunca borra un establecimiento.

- **Sin `--archivo`**: carga los 434 establecimientos de Lima que trae el archivo y no toca `activo`.
- **Con `--archivo=<ruta.csv>`**: carga el padrón completo desde el CSV con `\copy` (`COPY` del lado de `psql`). Cada fila crea o actualiza su establecimiento con el `activo` que dice su `estado`, y todo establecimiento que no viene en el archivo queda con `activo = false`.

```bash
DATABASE_URL=postgresql://<usuario>:<clave>@<host>:5432/<base> npm run db:seed:eess -- --archivo=/ruta/padron.csv --base-real=<base>
```

Formato del CSV: UTF-8 sin BOM, separado por comas, valores con comas o comillas entre comillas dobles. La primera línea es esta cabecera exacta, en este orden (si no coincide, la carga se niega):

```text
codigo_renipress,nombre,nivel,categoria,autoridad_sanitaria,departamento,provincia,distrito,estado
```

| Columna | Obligatoria | Regla |
|---|---|---|
| `codigo_renipress` | Sí | Solo dígitos; se quitan los ceros a la izquierda (`00005946` = `5946`). No se puede repetir en el archivo |
| `nombre` | Sí | Nombre del establecimiento |
| `nivel` | Sí | `I`, `II` o `III` |
| `categoria` | No | Por ejemplo `I-3`; vacía queda nula |
| `autoridad_sanitaria` | Sí | DIRIS, DIRESA o GERESA de la que depende |
| `departamento`, `provincia`, `distrito` | No | Vacías quedan nulas |
| `estado` | No | `ACTIVO` o `INACTIVO`, sin importar mayúsculas ni espacios; vacío es `ACTIVO` |

Autoridad sanitaria:

- Las cuatro DIRIS de Lima (`DIRIS Lima Centro`, `Este`, `Norte` y `Sur`, con o sin tildes ni mayúsculas) conservan sus áreas `DIRIS-LC`, `DIRIS-LE`, `DIRIS-LN` y `DIRIS-LS`.
- Cualquier otra autoridad crea o actualiza un área de tipo `DIRESA` con código `AUT-<nombre normalizado>`: sin tildes, en mayúsculas y con guiones en lugar de lo que no es letra ni número (`GERESA La Libertad` → `AUT-GERESA-LA-LIBERTAD`).
- Cada establecimiento tiene su área `EESS-<renipress>`, hija de su autoridad.

La carga se niega, sin cambiar nada, si el archivo no tiene filas, si un código o un nombre no es válido, si el nivel no existe, si la autoridad está vacía, si el estado no es `ACTIVO` ni `INACTIVO` o si un código se repite. Con 30 000 filas tarda unos 4 segundos.

## Auditoría

El esquema `auditoria` guarda evidencia de solo inserción: `evento` (cada hecho de una operación), `cambio_fila` (cada alta, cambio o borrado de las tablas de negocio auditadas) y `recurso_accedido` (lo que la API entregó en una respuesta). No está en `schema.prisma`: el bot no lo lee con Prisma.

- La API de gestión registra sus eventos solo con `auditoria.registrar_evento(evento, recursos)` y declara el evento de la operación con `set_config('app.auditoria', '{"evento_id":"..."}', true)`; los cambios de fila de esa transacción se cuelgan de él.
- Las escrituras del bot también se auditan: sin `app.auditoria`, el disparador crea un evento de la conexión (`BASE_DATOS`) sin inventar un autor.
- Una acción de una operación que quedó con su evento `INICIADO` y sin cierre en su fase se cierra agregando un evento `INTERRUMPIDO` (motivo `SIN_CIERRE`), nunca borrando: lo hace `auditoria.cerrar_operaciones_interrumpidas(antigüedad, lote)`. Una solicitud HTTP solo la cierra su `ENTREGA` (el commit de la transacción no basta); las demás fases, cualquier cierre de esa fase; `CANAL_EVENTOS` (el canal en vivo) queda fuera. El bot la llama al arrancar y después cada hora, con una hora de antigüedad (`lib/constants/limits/auditoria.ts`) y deja `auditoria.operaciones_interrumpidas` en el log. Tiene su propio candado, así que varias instancias o un cron de Infraestructura pueden llamarla a la vez sin cerrar dos veces. Cuánto tiempo se guarda la auditoría (retención por antigüedad o volumen) está por decidir con Infraestructura.
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

- Toda tabla y columna nueva lleva su `COMMENT ON` en `sql/comentarios.sql`, que se edita a mano; una llave foránea se explica en la línea `- columna → tabla: motivo` bajo `Relaciones:` del comentario de su tabla, y una función lleva su `COMMENT ON FUNCTION` en su propio archivo de `sql/functions/`. El arranque aplica ese archivo y no depende de nada en `docs/`; `tests/04_comentarios.sql` falla si a una tabla o columna le falta su descripción.
- Un rol o un valor de catálogo no se borra: se retira con `activo = false`.
- Cada alta, cambio o borrado de negocio de una incidencia avisa por el canal `minsa_incidencias_cambio` (`chatbot.fn_notificar_cambio_incidencia`, disparador `trg_incidencia_paciente_notificar_cambio`), después del commit y solo con el área y la categoría de antes y de después; lo escucha la API de gestión, que comprueba la marca `minsa-incidencias:eventos-v3` del comentario de la función.
- La purga de sesiones (`chatbot.purgar_sesiones_inactivas`) la programa Infraestructura (`pg_cron` o el cron del servidor); hoy nadie la llama.

| Comando | Qué hace |
|---|---|
| `npx prisma migrate deploy` | Aplica las migraciones pendientes |
| `npm run db:aplicar` | Aplica `sql/` y `seeds/catalogos/` |
| `npm run db:test` | Arma una base desechable con todo lo anterior y corre `tests/` (necesita `psql`) |
| `npm run db:seed:eess` | Carga el padrón de establecimientos ejecutando `seeds/eess/establecimientos.sql` en una sola transacción; repetirlo no crea nada nuevo. Con `--archivo=<ruta.csv>` carga el padrón completo y desactiva lo que no viene en el archivo (ver [Padrón de establecimientos](#padrón-de-establecimientos)). Solo en bases que terminan en `_desechable`, `_dev` o `_local`, o con `--base-real=<base>` (necesita `psql`) |
| `npm run smoke:postgres` | Pruebas de humo con Prisma Client contra una base armada |
