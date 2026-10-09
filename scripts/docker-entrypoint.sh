#!/bin/sh
set -eu

PRISMA_CLI="${PRISMA_CLI:-/opt/prisma/node_modules/prisma/build/index.js}"
PRISMA_SCHEMA="${PRISMA_SCHEMA:-/app/prisma/schema.prisma}"
MIGRACION_FALLIDA="20261004000000_init"

log() {
  printf '[entrypoint] %s\n' "$1"
}

if [ "${DATABASE_ENABLED:-}" = "false" ]; then
  if [ -n "${DATABASE_URL:-}" ]; then
    log "ADVERTENCIA: DATABASE_ENABLED=false pero DATABASE_URL tiene un valor. El servicio arranca SIN base de datos y no aplica migraciones. Si quieres usar la base, define DATABASE_ENABLED=true."
  else
    log "ADVERTENCIA: no hay base de datos activa (DATABASE_ENABLED=false). La conversación vive en memoria y los reclamos no se pueden guardar."
  fi
  exec "$@"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  log "ERROR: la base de datos está activa (DATABASE_ENABLED distinto de false) pero DATABASE_URL está vacía. Define DATABASE_URL o pon DATABASE_ENABLED=false."
  exit 1
fi

if [ -n "${RESET_DATABASE_CONFIRM:-}" ]; then
  db_name="${DATABASE_URL##*/}"
  db_name="${db_name%%\?*}"
  if [ "$RESET_DATABASE_CONFIRM" != "$db_name" ]; then
    log "ERROR: RESET_DATABASE_CONFIRM no coincide con el nombre de la base de DATABASE_URL. No se borró nada y el servicio no se inicia."
    exit 1
  fi
  log "ADVERTENCIA: RESET_DATABASE_CONFIRM activo. Borrando los esquemas catalogo, chatbot, gestion e ia, las funciones fn_* de public y el historial de migraciones."
  if ! node "$PRISMA_CLI" db execute --schema "$PRISMA_SCHEMA" --stdin <<'SQL'
DROP SCHEMA IF EXISTS "catalogo", "chatbot", "gestion", "ia" CASCADE;
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS f
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'fn\_%'
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.f || ' CASCADE';
  END LOOP;
END $$;
DROP TABLE IF EXISTS _prisma_migrations;
SQL
  then
    log "ERROR: no se pudo borrar la base. Revisa que el usuario de DATABASE_URL sea dueño de esos objetos."
    exit 1
  fi
  log "Base borrada. Las migraciones se aplicarán desde cero."
fi

log "Marcando como revertida la migración $MIGRACION_FALLIDA, si quedó fallida, para reintentarla."
if ! node "$PRISMA_CLI" migrate resolve --rolled-back "$MIGRACION_FALLIDA" --schema "$PRISMA_SCHEMA"; then
  log "ADVERTENCIA: no se pudo marcar como revertida (si ya está aplicada o no existe, es normal). Se continúa con las migraciones."
fi

log "Aplicando migraciones pendientes."
if ! node "$PRISMA_CLI" migrate deploy --schema "$PRISMA_SCHEMA"; then
  log "ERROR: las migraciones fallaron y el servicio no se inicia. Revisa que DATABASE_URL apunte a una base alcanzable, que la base exista (o que el usuario tenga CREATEDB para crearla), que el usuario sea su dueño y que su historial de migraciones coincida con el de este código."
  exit 1
fi

log "Migraciones al día. Iniciando el servicio."
exec "$@"
