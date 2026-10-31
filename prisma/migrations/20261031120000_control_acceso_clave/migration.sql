BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS "gestion"."control_acceso_clave" (
    "clave" TEXT NOT NULL,
    "ventana_desde" TIMESTAMPTZ(3) NOT NULL,
    "fallos" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_hasta" TIMESTAMPTZ(3),

    CONSTRAINT "pk_control_acceso_clave" PRIMARY KEY ("clave"),
    CONSTRAINT "ck_control_acceso_clave_huella" CHECK (("clave" ~ '^[a-f0-9]{64}$')),
    CONSTRAINT "ck_control_acceso_clave_fallos" CHECK (("fallos" >= 0)),
    CONSTRAINT "ck_control_acceso_clave_bloqueo" CHECK ((("bloqueado_hasta" IS NULL) OR (("fallos" > 0) AND ("bloqueado_hasta" >= "ventana_desde"))))
);

CREATE INDEX IF NOT EXISTS "ix_control_acceso_clave_bloqueado_hasta" ON "gestion"."control_acceso_clave"("bloqueado_hasta") WHERE ("bloqueado_hasta" IS NOT NULL);

COMMIT;
