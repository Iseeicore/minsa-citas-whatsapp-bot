BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE SCHEMA IF NOT EXISTS "auditoria";

CREATE TABLE IF NOT EXISTS "auditoria"."evento" (
    "id" UUID NOT NULL,
    "version_formato" INTEGER NOT NULL DEFAULT 1,
    "operacion_id" UUID NOT NULL,
    "peticion_id" UUID,
    "evento_padre_id" UUID,
    "evento_autorizacion_id" UUID,
    "rectifica_evento_id" UUID,
    "ocurrido_en" TIMESTAMPTZ(3) NOT NULL,
    "registrado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "origen" TEXT NOT NULL,
    "servicio" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "fase" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "actor_tipo" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_contexto" JSONB NOT NULL DEFAULT '{}',
    "sujeto_id" TEXT,
    "tipo_autorizacion" TEXT,
    "regla_autorizacion" TEXT,
    "contexto_autorizacion" JSONB NOT NULL DEFAULT '{}',
    "recurso_tipo" TEXT,
    "recurso_id" TEXT,
    "contexto_tecnico" JSONB NOT NULL DEFAULT '{}',
    "motivo_codigo" TEXT,
    "politica_aplicada" JSONB NOT NULL DEFAULT '{}',
    "detalle" JSONB NOT NULL DEFAULT '{}',
    "huella_contenido" BYTEA NOT NULL,

    CONSTRAINT "pk_auditoria_evento" PRIMARY KEY ("id"),
    CONSTRAINT "fk_auditoria_evento_padre" FOREIGN KEY ("evento_padre_id") REFERENCES "auditoria"."evento"("id") DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT "fk_auditoria_evento_autorizacion" FOREIGN KEY ("evento_autorizacion_id") REFERENCES "auditoria"."evento"("id") DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT "fk_auditoria_evento_rectificado" FOREIGN KEY ("rectifica_evento_id") REFERENCES "auditoria"."evento"("id") DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT "ck_auditoria_evento_version" CHECK (("version_formato" = 1)),
    CONSTRAINT "ck_auditoria_evento_fase" CHECK (("fase" IN ('SOLICITUD', 'AUTORIZACION', 'EJECUCION', 'ENTREGA', 'OBSERVACION'))),
    CONSTRAINT "ck_auditoria_evento_resultado" CHECK (("resultado" IN ('INICIADO', 'PERMITIDO', 'DENEGADO', 'COMPLETADO', 'FALLIDO', 'INTERRUMPIDO'))),
    CONSTRAINT "ck_auditoria_evento_actor" CHECK (("actor_tipo" IN ('USUARIO', 'SISTEMA', 'NO_AUTENTICADO', 'BASE_DATOS'))),
    CONSTRAINT "ck_auditoria_evento_autorizacion" CHECK ((("tipo_autorizacion" IS NULL) OR ("tipo_autorizacion" IN ('POLITICA', 'HUMANA')))),
    CONSTRAINT "ck_auditoria_evento_codigos" CHECK (((length("origen") BETWEEN 1 AND 80) AND (length("servicio") BETWEEN 1 AND 80) AND (length("modulo") BETWEEN 1 AND 80) AND (length("accion") BETWEEN 1 AND 120))),
    CONSTRAINT "ck_auditoria_evento_contextos" CHECK (((jsonb_typeof("actor_contexto") = 'object') AND (octet_length("actor_contexto"::text) <= 4096) AND (jsonb_typeof("contexto_autorizacion") = 'object') AND (octet_length("contexto_autorizacion"::text) <= 4096) AND (jsonb_typeof("contexto_tecnico") = 'object') AND (octet_length("contexto_tecnico"::text) <= 4096) AND (jsonb_typeof("politica_aplicada") = 'object') AND (octet_length("politica_aplicada"::text) <= 4096) AND (jsonb_typeof("detalle") = 'object') AND (octet_length("detalle"::text) <= 4096))),
    CONSTRAINT "ck_auditoria_evento_huella" CHECK ((octet_length("huella_contenido") = 32))
);

CREATE TABLE IF NOT EXISTS "auditoria"."cambio_fila" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "evento_id" UUID NOT NULL,
    "esquema" TEXT NOT NULL,
    "tabla" TEXT NOT NULL,
    "clave_fila" JSONB NOT NULL,
    "operacion" TEXT NOT NULL,
    "campos_modificados" TEXT[] NOT NULL,
    "valores_anteriores" JSONB NOT NULL DEFAULT '{}',
    "valores_nuevos" JSONB NOT NULL DEFAULT '{}',
    "version_resultante" INTEGER,
    "politica_redaccion" TEXT NOT NULL,

    CONSTRAINT "pk_auditoria_cambio_fila" PRIMARY KEY ("id"),
    CONSTRAINT "fk_auditoria_cambio_evento" FOREIGN KEY ("evento_id") REFERENCES "auditoria"."evento"("id"),
    CONSTRAINT "ck_auditoria_cambio_operacion" CHECK (("operacion" IN ('INSERT', 'UPDATE', 'DELETE'))),
    CONSTRAINT "ck_auditoria_cambio_json" CHECK (((jsonb_typeof("clave_fila") = 'object') AND (octet_length("clave_fila"::text) <= 4096) AND (jsonb_typeof("valores_anteriores") = 'object') AND (octet_length("valores_anteriores"::text) <= 16384) AND (jsonb_typeof("valores_nuevos") = 'object') AND (octet_length("valores_nuevos"::text) <= 16384)))
);

CREATE TABLE IF NOT EXISTS "auditoria"."recurso_accedido" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "evento_id" UUID NOT NULL,
    "recurso_tipo" TEXT NOT NULL,
    "recurso_id" TEXT NOT NULL,
    "version_recurso" TEXT,
    "modalidad" TEXT NOT NULL,
    "grupos_datos" TEXT[] NOT NULL,
    "manifiesto_id" TEXT,

    CONSTRAINT "pk_auditoria_recurso_accedido" PRIMARY KEY ("id"),
    CONSTRAINT "fk_auditoria_recurso_evento" FOREIGN KEY ("evento_id") REFERENCES "auditoria"."evento"("id"),
    CONSTRAINT "ck_auditoria_recurso_modalidad" CHECK (("modalidad" IN ('LISTADO', 'DETALLE', 'HISTORIAL', 'DESCARGA', 'EXPORTACION'))),
    CONSTRAINT "ck_auditoria_recurso_limites" CHECK (((length("recurso_tipo") BETWEEN 1 AND 80) AND (length("recurso_id") BETWEEN 1 AND 256) AND (cardinality("grupos_datos") BETWEEN 1 AND 30) AND (("version_recurso" IS NULL) OR (length("version_recurso") <= 128)) AND (("manifiesto_id" IS NULL) OR (length("manifiesto_id") <= 256))))
);

CREATE INDEX IF NOT EXISTS "ix_auditoria_evento_operacion" ON "auditoria"."evento"("operacion_id", "registrado_en");
CREATE INDEX IF NOT EXISTS "ix_auditoria_evento_actor_fecha" ON "auditoria"."evento"("actor_id", "registrado_en");
CREATE INDEX IF NOT EXISTS "ix_auditoria_evento_recurso_fecha" ON "auditoria"."evento"("recurso_tipo", "recurso_id", "registrado_en");
CREATE INDEX IF NOT EXISTS "ix_auditoria_cambio_evento" ON "auditoria"."cambio_fila"("evento_id");
CREATE INDEX IF NOT EXISTS "ix_auditoria_cambio_recurso" ON "auditoria"."cambio_fila"("esquema", "tabla", "evento_id");
CREATE INDEX IF NOT EXISTS "ix_auditoria_recurso_evento" ON "auditoria"."recurso_accedido"("evento_id");
CREATE INDEX IF NOT EXISTS "ix_auditoria_recurso_identidad" ON "auditoria"."recurso_accedido"("recurso_tipo", "recurso_id", "evento_id");

COMMIT;
