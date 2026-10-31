BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE INDEX IF NOT EXISTS "ix_auditoria_evento_iniciado" ON "auditoria"."evento"("registrado_en") WHERE ("resultado" = 'INICIADO');

COMMIT;
