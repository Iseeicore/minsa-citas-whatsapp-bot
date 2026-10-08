# Base de datos: esquema, migraciones y pruebas

Todo lo que define la base vive aquí y se versiona con el código.

| Qué | Dónde |
|---|---|
| Tablas, llaves e índices | `schema.prisma` |
| Historial de cambios de la base | `migrations/` (una carpeta SQL por cambio) |
| Reglas, funciones, disparadores, semillas | dentro de las migraciones (Prisma no los describe en `schema.prisma`) |
| Pruebas de comportamiento en SQL | `tests/*.sql` |
| Diccionario de datos y diagramas | `diccionario/` |

## Cómo se versiona un cambio

1. **Nunca se edita una migración ya aplicada** en un entorno compartido (OGTI, pruebas del equipo). Un cambio es siempre una migración **nueva**. *Excepciones (solo mientras nada se haya aplicado en un entorno real):* el 2026-10-04 se reescribió la migración inicial y el 2026-10-07 las migraciones de áreas, establecimientos, motivo de archivo y roles. La carpeta `20261005060000_ajuste_roles` quedó vacía a propósito: su contenido se integró en las migraciones que crean esos objetos y se conserva solo para no romper la secuencia.
2. Tablas o columnas: cambiar `schema.prisma` y crear la migración **sin aplicarla**:
   ```bash
   npx prisma migrate dev --create-only --name <que_cambia>
   ```
   Después se agrega al mismo archivo el SQL que Prisma no genera: restricciones `CHECK`, índices parciales, funciones, disparadores y semillas.
3. Funciones: `CREATE OR REPLACE FUNCTION` en la migración nueva. Disparadores: `DROP TRIGGER IF EXISTS` y `CREATE TRIGGER`. El historial de una función es la lista de migraciones que la redefinen.
4. Catálogos: los valores nuevos van en una migración con `INSERT ... ON CONFLICT (id) DO NOTHING`.
5. **Toda tabla y columna lleva su descripción** (`COMMENT ON`). Se agrega a `diccionario/diccionario.json`, se corre `npm run db:diccionario` y se copian a la migración los `COMMENT` nuevos de `diccionario/generado/comentarios.sql`. La prueba `tests/04_comentarios.sql` falla si falta alguna.
6. Cada regla nueva lleva su prueba en `tests/` y se verifica que **falle** cuando la regla se apaga.
7. **Un rol o un valor de catálogo no se borra: se retira con `activo = false`.** Las filas de `rol_categoria` y `usuario_rol` no se tocan, y las consultas cuentan solo los roles activos (así nace desactivado el rol `DIRIS`; los permisos son por rol, sin tablas de módulos).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run db:test` | Crea una base desechable, la arma **solo con las migraciones**, corre `tests/*.sql` y la borra |
| `npm run db:seed:eess` | Carga el padrón real de establecimientos (`seeds/eess/establecimientos.json`: 434 filas) con el cargador `seeds/eess/cargar_establecimientos.sql`, en una sola transacción: las 4 DIRIS de Lima (`DIRIS-LE`, `-LN`, `-LC`, `-LS`), un área por establecimiento (`EESS-<renipress>`, hija de su DIRIS) y el establecimiento (código RENIPRESS **sin ceros a la izquierda**: los quita si vienen; nivel y categoría; la dirección de la fuente no se guarda porque la tabla no tiene esa columna). Es idempotente: repetirlo no toca lo que no cambió y actualiza lo que sí. Misma guardia que `db:seed:dev` (la base debe terminar en `_desechable`, `_dev` o `_local`); para una base real se repite el nombre a mano: `-- --base-real=<nombre de la base>`. Resultado: 434 establecimientos, 439 áreas (434 + 4 DIRIS + OTRANS) |
| `npm run db:seed:dev` | **Correr después de `db:seed:eess`** (usa los establecimientos 6206, 5946 y 5614). Siembra 6 usuarios internos de ejemplo (administrador y gestor sin área, uno de OTRANS y tres de establecimiento en el Hospital Dos de Mayo, el Hospital Hipólito Unanue y el C.S. Bayovar) y 18 incidencias **sintéticas** (de todos los estados y categorías, con evidencias; seis por establecimiento de origen; las derivaciones llevan área de destino, las denuncias por corrupción van a OTRANS conservando su origen, y cuatro quedan archivadas con su motivo). Los usuarios **no llevan clave en ningún archivo**: sin más, la base les pone una huella al azar que nadie conoce (no se puede iniciar sesión); para poder entrar se pasa una huella Argon2id ya calculada, nunca la clave, en `SEED_DEV_PASSWORD_HASH`. Se niega a correr si el nombre de la base no termina en `_desechable`, `_dev` o `_local`. `-- --reiniciar` borra **todas** las incidencias de esa base (y reinicia el contador de códigos) y vuelve a sembrar; los usuarios de ejemplo se conservan. Los nombres y los DNI son inventados (los DNI empiezan con `0000`) y los archivos de evidencia no existen. Usa las mismas operaciones que la aplicación y solo apaga un momento los disparadores de usuario para dar edad a los casos. No es una migración: nunca va a OGTI |
| `npm run db:diccionario` | Regenera el diccionario de datos y los diagramas desde una base ya migrada. Falla si en `diccionario.json` falta la descripción de alguna tabla, columna, llave foránea o función de disparador |
| `npm run smoke:postgres` | Pruebas de humo con Prisma Client contra una base migrada |
| `npx prisma migrate deploy` | Aplica las migraciones pendientes |

`db:test`, `db:diccionario` y las semillas necesitan `psql` (o la variable `PSQL_PATH`) y un `DATABASE_URL`. Para `db:test` basta cualquier base del servidor: nunca la toca, crea y borra la suya. Orden para una base de desarrollo: `npx prisma migrate deploy` → `npm run db:seed:eess` → `npm run db:seed:dev`.

## Áreas, establecimientos y roles

- `catalogo.tipo_area` (ESTABLECIMIENTO, OTRANS, DIRIS, INSTITUTO, ORGANISMO) dice qué tipos reciben casos sensibles (`recibe_sensibles`: hoy solo OTRANS). `catalogo.area` es a donde se deriva un caso y a donde pertenece un usuario; la migración siembra el área `OTRANS` (id 1). `catalogo.establecimiento_salud` (padrón RENIPRESS) enlaza 1 a 1 con su área y se carga con `db:seed:eess`, no con la migración.
- El origen de la incidencia es `establecimiento_id` (no cambia una vez puesto); el destino es `area_destino_id`. Derivar o tomar un caso exige destino; la denuncia por corrupción va siempre a OTRANS, también si se corrige la categoría después de derivarla; `derivado_*`, `tomado_*` y `archivado_en` los llena la base.
- Archivar exige un motivo (`catalogo.motivo_archivo`): `RESUELTA_VIGENCIA` y `VENCIDA_SIN_ATENDER` los deduce la base; `DATOS_INSUFICIENTES` lo indica quien archiva (`sistema:filtro` o `usuario:%`) y solo desde REGISTRADO o CLASIFICADO.
- Roles finales: `ADMINISTRADOR`, `GESTOR` (sin tipo de área), `OTRANS`, `ESTABLECIMIENTO` y `DIRIS` (desactivado). Un rol con tipo de área solo se asigna a un usuario de un área de ese tipo; cambiar el área de un usuario cierra sus sesiones.
- Las pruebas de esto están en `tests/12_*` a `tests/16_*`.

## Enums de ids y pruebas de humo

- Los enums de `lib/enums/*-id.ts` espejan los ids fijos de las tablas `catalogo.*` (los fija la migración o la semilla) (incluidos `tipo-area-id`, `nivel-atencion-id` y `motivo-archivo-id`) y hay que mantenerlos sincronizados: lo comprueba `tests/smoke/catalogos-contrato.postgres.test.ts`. Los enums `conversation-status`, `message-direction`, `message-status` y `message-type` son el contrato de la bandeja web y `lib/inbox/dto.ts` los traduce desde esos ids.
- Las pruebas de humo (`tests/smoke`) no pueden borrar lo que crean: los usuarios y las incidencias son borrado lógico, y el historial y las tablas de carga son de solo inserción. Sus filas quedan en la base de prueba, con identificadores únicos por corrida.

## Saltos de línea y checksum

Prisma calcula el checksum de cada migración sobre el contenido del archivo: con saltos de línea distintos entre Windows y Linux, una migración ya aplicada se vería como modificada. Por eso `.gitattributes` guarda siempre con LF las migraciones, `migration_lock.toml`, `tests/*.sql` y las semillas.

## Código legible de la incidencia

Cada incidencia lleva un `codigo` con el formato `MINSA-AAAA-NNNNNN` (por ejemplo `MINSA-2026-003241`): `AAAA` es el año de llegada en la zona `America/Lima` y `NNNNNN` el correlativo de ese año, que reinicia cada año y pasado el `999999` sigue creciendo. Lo asigna la base al insertar (lo que envíe quien inserta se descarta) y no se puede modificar; el contador vive en `chatbot.contador_codigo_incidencia` y se incrementa dentro de la transacción del `INSERT`, así que una transacción revertida no gasta número y dos simultáneas esperan su turno (el costo: las inserciones de incidencias se serializan, lo cual es aceptable con el volumen esperado). El `trace_id` sigue siendo el id del turno del chat; el código legible es el que se muestra en pantalla y se dice por teléfono.

`tests/11_codigo_incidencia.sql` prueba la concurrencia con dos conexiones `dblink`: necesita un usuario que pueda crear la extensión (el de `db:test` y el del CI lo son) y que el servidor acepte conexiones locales por socket sin clave, como la imagen oficial de PostgreSQL.

## Lo que Prisma no vigila

El control de desvío de Prisma (`migrate diff`) compara tablas, pero **no ve funciones ni disparadores**: un cambio hecho a mano en la base no se detecta. La red de seguridad son las pruebas de `tests/`, que corren en el CI sobre una base armada solo con las migraciones.

## Tareas programadas (por ejemplo, la purga de sesiones)

Prisma no programa tareas. La **función** (por ejemplo `chatbot.purgar_sesiones_inactivas`) va en una migración y se versiona; **quién la ejecuta** y cada cuánto (`pg_cron` o el cron del servidor) es infraestructura y la define OGTI. Mientras tanto la función existe y está probada, pero nadie la llama.
