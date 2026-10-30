BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS "chatbot"."consulta_incidencia_intento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identificador" TEXT NOT NULL,
    "canal_origen_id" SMALLINT NOT NULL,
    "resultado" TEXT NOT NULL,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_consulta_incidencia_intento" PRIMARY KEY ("id"),
    CONSTRAINT "ck_consulta_incidencia_intento_identificador" CHECK ((char_length(btrim("identificador")) > 0)),
    CONSTRAINT "ck_consulta_incidencia_intento_resultado" CHECK (("resultado" IN ('encontrada', 'no_encontrada', 'error', 'reintentos_agotados'))),
    CONSTRAINT "fk_consulta_incidencia_intento_canal_origen" FOREIGN KEY ("canal_origen_id") REFERENCES "catalogo"."canal_origen"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ix_consulta_incidencia_intento_identificador_fecha" ON "chatbot"."consulta_incidencia_intento"("identificador", "fecha_creacion");

COMMIT;
