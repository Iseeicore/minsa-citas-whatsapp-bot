BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE "chatbot"."aceptacion_terminos" ADD COLUMN IF NOT EXISTS "flujo" TEXT NOT NULL DEFAULT 'CITA';
ALTER TABLE "chatbot"."aceptacion_terminos" DROP CONSTRAINT IF EXISTS "ck_aceptacion_terminos_flujo";
ALTER TABLE "chatbot"."aceptacion_terminos" ADD CONSTRAINT "ck_aceptacion_terminos_flujo" CHECK (("flujo" = ANY (ARRAY['CITA'::text, 'DENUNCIA'::text])));

CREATE INDEX IF NOT EXISTS "ix_aceptacion_terminos_wa_id_version" ON "chatbot"."aceptacion_terminos"("wa_id", "version");
DROP INDEX IF EXISTS "chatbot"."ix_aceptacion_terminos_wa_id";

COMMIT;
