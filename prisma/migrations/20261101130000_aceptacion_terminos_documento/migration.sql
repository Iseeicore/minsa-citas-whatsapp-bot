BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE "chatbot"."aceptacion_terminos" ADD COLUMN IF NOT EXISTS "documento" TEXT NOT NULL DEFAULT 'TERMINOS';
ALTER TABLE "chatbot"."aceptacion_terminos" DROP CONSTRAINT IF EXISTS "ck_aceptacion_terminos_documento";
ALTER TABLE "chatbot"."aceptacion_terminos" ADD CONSTRAINT "ck_aceptacion_terminos_documento" CHECK (("documento" = ANY (ARRAY['TERMINOS'::text, 'DATOS_PERSONALES'::text])));

CREATE INDEX IF NOT EXISTS "ix_aceptacion_terminos_wa_id_flujo_documento_version" ON "chatbot"."aceptacion_terminos"("wa_id", "flujo", "documento", "version");
DROP INDEX IF EXISTS "chatbot"."ix_aceptacion_terminos_wa_id_version";

COMMIT;
