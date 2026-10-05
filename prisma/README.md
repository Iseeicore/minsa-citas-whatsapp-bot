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

1. **Nunca se edita una migración ya aplicada** en un entorno compartido (OGTI, pruebas del equipo). Un cambio es siempre una migración **nueva**. *Excepción única:* el 2026-10-04 la migración inicial se reescribió porque no se había aplicado en ningún entorno real.
2. Tablas o columnas: cambiar `schema.prisma` y crear la migración **sin aplicarla**:
   ```bash
   npx prisma migrate dev --create-only --name <que_cambia>
   ```
   Después se agrega al mismo archivo el SQL que Prisma no genera: restricciones `CHECK`, índices parciales, funciones, disparadores y semillas.
3. Funciones: `CREATE OR REPLACE FUNCTION` en la migración nueva. Disparadores: `DROP TRIGGER IF EXISTS` y `CREATE TRIGGER`. El historial de una función es la lista de migraciones que la redefinen.
4. Catálogos: los valores nuevos van en una migración con `INSERT ... ON CONFLICT (id) DO NOTHING`.
5. **Toda tabla y columna lleva su descripción** (`COMMENT ON`). Se agrega a `diccionario/diccionario.json`, se corre `npm run db:diccionario` y se copian a la migración los `COMMENT` nuevos de `diccionario/generado/comentarios.sql`. La prueba `tests/04_comentarios.sql` falla si falta alguna.
6. Cada regla nueva lleva su prueba en `tests/` y se verifica que **falle** cuando la regla se apaga.
7. **Un rol o un valor de catálogo no se borra: se retira con `activo = false`.** Las filas de `rol_categoria` y `usuario_rol` no se tocan, y las consultas cuentan solo los roles activos (así se retiró el revisor en `ajuste_roles`; los permisos son por rol, sin tablas de módulos).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run db:test` | Crea una base desechable, la arma **solo con las migraciones**, corre `tests/*.sql` y la borra |
| `npm run db:seed:dev` | Siembra 18 incidencias **sintéticas** (de todos los estados y categorías, con evidencias) en una base de desarrollo. Se niega a correr si el nombre de la base no termina en `_desechable`, `_dev` o `_local`. `-- --reiniciar` borra **todas** las incidencias de esa base (y reinicia el contador de códigos) y vuelve a sembrar. No es una migración: nunca va a OGTI |
| `npm run db:diccionario` | Regenera el diccionario de datos y los diagramas desde una base ya migrada |
| `npm run smoke:postgres` | Pruebas de humo con Prisma Client contra una base migrada |
| `npx prisma migrate deploy` | Aplica las migraciones pendientes |

`db:test` y `db:diccionario` necesitan `psql` (o la variable `PSQL_PATH`) y un `DATABASE_URL`. Para `db:test` basta cualquier base del servidor: nunca la toca, crea y borra la suya.

## Código legible de la incidencia

Cada incidencia lleva un `codigo` con el formato `MINSA-AAAA-NNNNNN` (por ejemplo `MINSA-2026-003241`): `AAAA` es el año de llegada en la zona `America/Lima` y `NNNNNN` el correlativo de ese año, que reinicia cada año y pasado el `999999` sigue creciendo. Lo asigna la base al insertar (lo que envíe quien inserta se descarta) y no se puede modificar; el contador vive en `chatbot.contador_codigo_incidencia` y se incrementa dentro de la transacción del `INSERT`, así que una transacción revertida no gasta número y dos simultáneas esperan su turno (el costo: las inserciones de incidencias se serializan, lo cual es aceptable con el volumen esperado). El `trace_id` sigue siendo el id del turno del chat; el código legible es el que se muestra en pantalla y se dice por teléfono.

`tests/11_codigo_incidencia.sql` prueba la concurrencia con dos conexiones `dblink`: necesita un usuario que pueda crear la extensión (el de `db:test` y el del CI lo son) y que el servidor acepte conexiones locales por socket sin clave, como la imagen oficial de PostgreSQL.

## Lo que Prisma no vigila

El control de desvío de Prisma (`migrate diff`) compara tablas, pero **no ve funciones ni disparadores**: un cambio hecho a mano en la base no se detecta. La red de seguridad son las pruebas de `tests/`, que corren en el CI sobre una base armada solo con las migraciones.

## Tareas programadas (por ejemplo, la purga de sesiones)

Prisma no programa tareas. La **función** (por ejemplo `chatbot.purgar_sesiones_inactivas`) va en una migración y se versiona; **quién la ejecuta** y cada cuánto (`pg_cron` o el cron del servidor) es infraestructura y la define OGTI. Mientras tanto la función existe y está probada, pero nadie la llama.
