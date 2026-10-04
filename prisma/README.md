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

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run db:test` | Crea una base desechable, la arma **solo con las migraciones**, corre `tests/*.sql` y la borra |
| `npm run db:diccionario` | Regenera el diccionario de datos y los diagramas desde una base ya migrada |
| `npm run smoke:postgres` | Pruebas de humo con Prisma Client contra una base migrada |
| `npx prisma migrate deploy` | Aplica las migraciones pendientes |

`db:test` y `db:diccionario` necesitan `psql` (o la variable `PSQL_PATH`) y un `DATABASE_URL`. Para `db:test` basta cualquier base del servidor: nunca la toca, crea y borra la suya.

## Lo que Prisma no vigila

El control de desvío de Prisma (`migrate diff`) compara tablas, pero **no ve funciones ni disparadores**: un cambio hecho a mano en la base no se detecta. La red de seguridad son las pruebas de `tests/`, que corren en el CI sobre una base armada solo con las migraciones.

## Tareas programadas (por ejemplo, la purga de sesiones)

Prisma no programa tareas. La **función** (por ejemplo `chatbot.purgar_sesiones_inactivas`) va en una migración y se versiona; **quién la ejecuta** y cada cuánto (`pg_cron` o el cron del servidor) es infraestructura y la define OGTI. Mientras tanto la función existe y está probada, pero nadie la llama.
