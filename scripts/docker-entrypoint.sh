#!/bin/sh
set -eu

PRISMA_CLI="${PRISMA_CLI:-/opt/prisma/node_modules/prisma/build/index.js}"
PRISMA_SCHEMA="${PRISMA_SCHEMA:-/app/prisma/schema.prisma}"

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

log "Aplicando migraciones pendientes."
if ! node "$PRISMA_CLI" migrate deploy --schema "$PRISMA_SCHEMA"; then
  log "ERROR: las migraciones fallaron y el servicio no se inicia. Revisa que DATABASE_URL apunte a una base alcanzable, que la base exista (o que el usuario tenga CREATEDB para crearla), que el usuario sea su dueño y que su historial de migraciones coincida con el de este código."
  exit 1
fi

log "Migraciones al día. Iniciando el servicio."
exec "$@"
