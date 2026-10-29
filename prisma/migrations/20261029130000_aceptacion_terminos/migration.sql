BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS "chatbot"."aceptacion_terminos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wa_id" TEXT NOT NULL,
    "canal_origen_id" SMALLINT NOT NULL,
    "version" TEXT NOT NULL,
    "aceptado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_aceptacion_terminos" PRIMARY KEY ("id"),
    CONSTRAINT "ck_aceptacion_terminos_wa_id" CHECK ((char_length(btrim("wa_id")) > 0)),
    CONSTRAINT "ck_aceptacion_terminos_version" CHECK ((char_length(btrim("version")) > 0)),
    CONSTRAINT "fk_aceptacion_terminos_canal_origen" FOREIGN KEY ("canal_origen_id") REFERENCES "catalogo"."canal_origen"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ix_aceptacion_terminos_wa_id" ON "chatbot"."aceptacion_terminos"("wa_id");

COMMIT;
