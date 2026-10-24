BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

DO $$
BEGIN
  IF to_regprocedure('uuidv7()') IS NULL THEN
    CREATE FUNCTION public.uuidv7() RETURNS uuid
    LANGUAGE sql VOLATILE PARALLEL SAFE AS $f$
      SELECT encode(
        set_bit(set_bit(
          overlay(uuid_send(gen_random_uuid()) PLACING substring(int8send((extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3) FROM 1 FOR 6),
        52, 1), 53, 1),
      'hex')::uuid
    $f$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.f_unaccent(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT lower(public.unaccent('public.unaccent', $1))
$$;

CREATE SCHEMA IF NOT EXISTS "catalogo";

CREATE SCHEMA IF NOT EXISTS "chatbot";

CREATE SCHEMA IF NOT EXISTS "gestion";

CREATE SCHEMA IF NOT EXISTS "ia";

CREATE TABLE "catalogo"."categoria_incidencia" (
    "id" SMALLSERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "es_sensible" BOOLEAN NOT NULL DEFAULT false,
    "plazo_dias_habiles" SMALLINT NOT NULL,
    "archiva_por_vencimiento" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_categoria_incidencia" PRIMARY KEY ("id")
);

CREATE TABLE "catalogo"."estado_incidencia" (
    "id" SMALLSERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_estado_incidencia" PRIMARY KEY ("id")
);

CREATE TABLE "catalogo"."canal_origen" (
    "id" SMALLSERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_canal_origen" PRIMARY KEY ("id")
);

CREATE TABLE "catalogo"."tipo_mensaje" (
    "id" SMALLSERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_tipo_mensaje" PRIMARY KEY ("id")
);

CREATE TABLE "catalogo"."direccion_mensaje" (
    "id" SMALLSERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_direccion_mensaje" PRIMARY KEY ("id")
);

CREATE TABLE "catalogo"."estado_mensaje" (
    "id" SMALLSERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_estado_mensaje" PRIMARY KEY ("id")
);

CREATE TABLE "catalogo"."tipo_evidencia" (
    "id" SMALLSERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_tipo_evidencia" PRIMARY KEY ("id")
);

CREATE TABLE "catalogo"."estado_conversacion" (
    "id" SMALLSERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_estado_conversacion" PRIMARY KEY ("id")
);

CREATE TABLE "catalogo"."tipo_area" (
    "id" SMALLSERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "recibe_sensibles" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_tipo_area" PRIMARY KEY ("id")
);

CREATE TABLE "catalogo"."nivel_atencion" (
    "id" SMALLSERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_nivel_atencion" PRIMARY KEY ("id")
);

CREATE TABLE "catalogo"."motivo_archivo" (
    "id" SMALLSERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_motivo_archivo" PRIMARY KEY ("id")
);

CREATE TABLE "catalogo"."resultado_resolucion" (
    "id" SMALLSERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_resultado_resolucion" PRIMARY KEY ("id")
);

CREATE TABLE "catalogo"."area" (
    "id" INTEGER GENERATED BY DEFAULT AS IDENTITY,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo_area_id" SMALLINT NOT NULL,
    "padre_id" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_area" PRIMARY KEY ("id")
);

CREATE TABLE "catalogo"."establecimiento_salud" (
    "id" INTEGER GENERATED BY DEFAULT AS IDENTITY,
    "codigo_renipress" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombre_busqueda" TEXT GENERATED ALWAYS AS (f_unaccent(nombre)) STORED,
    "nivel_atencion_id" SMALLINT,
    "categoria" TEXT,
    "departamento" TEXT,
    "provincia" TEXT,
    "distrito" TEXT,
    "red" TEXT,
    "area_id" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_establecimiento_salud" PRIMARY KEY ("id")
);

CREATE TABLE "chatbot"."usuario" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "wa_id" TEXT NOT NULL,
    "profile_name" TEXT,
    "phone_number" TEXT,
    "dni" TEXT,
    "nombre_completo" TEXT,
    "consentimiento_aceptado_en" TIMESTAMPTZ(3),
    "estado_conversacion_id" SMALLINT NOT NULL DEFAULT 1,
    "ultimo_mensaje_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" TEXT,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_usuario" PRIMARY KEY ("id")
);

CREATE TABLE "chatbot"."mensaje" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "usuario_id" UUID NOT NULL,
    "direccion_mensaje_id" SMALLINT NOT NULL,
    "tipo_mensaje_id" SMALLINT NOT NULL,
    "contenido" TEXT,
    "media_id" TEXT,
    "wa_message_id" TEXT,
    "estado_mensaje_id" SMALLINT NOT NULL DEFAULT 1,
    "fecha_hora" TIMESTAMPTZ(3) NOT NULL,
    "procesado_en" TIMESTAMPTZ(3),
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_mensaje" PRIMARY KEY ("id")
);

CREATE TABLE "chatbot"."incidencia_paciente" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "canal_origen_id" SMALLINT NOT NULL,
    "usuario_id" UUID NOT NULL,
    "mensaje_id" UUID,
    "wa_id" TEXT NOT NULL,
    "es_anonimo" BOOLEAN NOT NULL,
    "dni_reclamante" TEXT,
    "nombre_reclamante" TEXT,
    "descripcion" TEXT NOT NULL,
    "estado_incidencia_id" SMALLINT NOT NULL DEFAULT 1,
    "trace_id" TEXT NOT NULL,
    "categoria_id" SMALLINT,
    "categoria_ia_id" SMALLINT,
    "categoria_confianza" DECIMAL(5,2),
    "version_clasificador" TEXT,
    "categoria_asignada_en" TIMESTAMPTZ(3),
    "categoria_corregida_en" TIMESTAMPTZ(3),
    "categoria_corregida_por" TEXT,
    "categoria_confirmada_en" TIMESTAMPTZ(3),
    "categoria_confirmada_por" TEXT,
    "medidas_tomadas" TEXT,
    "fundamento" TEXT,
    "resultado_resolucion_id" SMALLINT,
    "resuelto_en" TIMESTAMPTZ(3),
    "resuelto_por" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" TEXT,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "codigo" TEXT NOT NULL DEFAULT '',
    "establecimiento_id" INTEGER,
    "area_destino_id" INTEGER,
    "derivado_en" TIMESTAMPTZ(3),
    "derivado_por" TEXT,
    "tomado_en" TIMESTAMPTZ(3),
    "tomado_por" TEXT,
    "motivo_archivo_id" SMALLINT,
    "archivado_en" TIMESTAMPTZ(3),
    "archivo_detalle" TEXT,
    "reabierto_en" TIMESTAMPTZ(3),
    "reabierto_por" TEXT,
    "reabierto_motivo" TEXT,
    "derivacion_descripcion" TEXT,

    CONSTRAINT "pk_incidencia_paciente" PRIMARY KEY ("id")
);

CREATE TABLE "chatbot"."incidencia_paciente_auditoria" (
    "id" BIGSERIAL NOT NULL,
    "incidencia_paciente_id" UUID NOT NULL,
    "operacion" VARCHAR(16) NOT NULL,
    "cambios" JSONB NOT NULL,
    "actor" TEXT NOT NULL,
    "version_fila" INTEGER NOT NULL,
    "fecha_hora" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_incidencia_paciente_auditoria" PRIMARY KEY ("id")
);

CREATE TABLE "chatbot"."incidencia_analisis" (
    "incidencia_paciente_id" UUID NOT NULL,
    "version_reglas" TEXT NOT NULL,
    "puntaje" SMALLINT NOT NULL,
    "senales" JSONB NOT NULL,
    "cargo_mencionado" TEXT,
    "area_mencionada_id" INTEGER,
    "nombre_mencionado" TEXT,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_incidencia_analisis" PRIMARY KEY ("incidencia_paciente_id")
);

CREATE TABLE "chatbot"."evidencia" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "incidencia_paciente_id" UUID NOT NULL,
    "mensaje_id" UUID,
    "media_id" TEXT,
    "tipo_evidencia_id" SMALLINT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "nombre_archivo" TEXT,
    "tamano" INTEGER NOT NULL,
    "ruta" TEXT NOT NULL,
    "hash_archivo" TEXT,
    "fecha_recepcion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_evidencia" PRIMARY KEY ("id")
);

CREATE TABLE "chatbot"."sesion_conversacion" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "wa_id" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "slots" JSONB NOT NULL,
    "contadores" JSONB NOT NULL,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_sesion_conversacion" PRIMARY KEY ("id")
);

CREATE TABLE "chatbot"."contador_codigo_incidencia" (
    "anio" SMALLINT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_contador_codigo_incidencia" PRIMARY KEY ("anio")
);

CREATE TABLE "ia"."entrenamiento_categoria" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "incidencia_paciente_id" UUID NOT NULL,
    "texto_entrenamiento" TEXT NOT NULL,
    "categoria_ia_id" SMALLINT NOT NULL,
    "categoria_final_id" SMALLINT NOT NULL,
    "fue_corregida" BOOLEAN NOT NULL,
    "categoria_confianza" DECIMAL(5,2),
    "version_clasificador" TEXT,
    "revisado_por" TEXT NOT NULL,
    "fecha_revision" TIMESTAMPTZ(3) NOT NULL,
    "apto_entrenamiento" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_entrenamiento_categoria" PRIMARY KEY ("id")
);

CREATE TABLE "gestion"."usuario_interno" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "nombre_completo" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "area_id" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" TEXT,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_usuario_interno" PRIMARY KEY ("id")
);

CREATE TABLE "gestion"."rol" (
    "id" SMALLSERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo_area_id" SMALLINT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_rol" PRIMARY KEY ("id")
);

CREATE TABLE "gestion"."sesion_usuario" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "usuario_interno_id" UUID NOT NULL,
    "ultima_actividad_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vence_en" TIMESTAMPTZ(3) NOT NULL,
    "revocada_en" TIMESTAMPTZ(3),
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_sesion_usuario" PRIMARY KEY ("id")
);

CREATE TABLE "gestion"."usuario_rol" (
    "usuario_interno_id" UUID NOT NULL,
    "rol_id" SMALLINT NOT NULL,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_usuario_rol" PRIMARY KEY ("usuario_interno_id","rol_id")
);

CREATE TABLE "catalogo"."estado_archivo" (
    "id" SMALLSERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_estado_archivo" PRIMARY KEY ("id")
);

CREATE TABLE "chatbot"."solicitud_carga" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "incidencia_paciente_id" UUID,
    "sesion_id" UUID,
    "usuario_id" UUID NOT NULL,
    "hash_token" TEXT NOT NULL,
    "vence_en" TIMESTAMPTZ(3) NOT NULL,
    "cerrada_en" TIMESTAMPTZ(3),
    "max_archivos" SMALLINT NOT NULL,
    "max_bytes_archivo" INTEGER NOT NULL,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_solicitud_carga" PRIMARY KEY ("id")
);

CREATE TABLE "chatbot"."archivo_recibido" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "solicitud_carga_id" UUID NOT NULL,
    "nombre_original" TEXT,
    "mime_declarado" TEXT NOT NULL,
    "mime_detectado" TEXT,
    "tamano" BIGINT NOT NULL,
    "hash_archivo" TEXT,
    "ruta_cuarentena" TEXT NOT NULL,
    "estado_archivo_id" SMALLINT NOT NULL DEFAULT 1,
    "motivo_rechazo" TEXT,
    "verificado_en" TIMESTAMPTZ(3),
    "evidencia_id" UUID,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_archivo_recibido" PRIMARY KEY ("id")
);

CREATE TABLE "gestion"."rol_categoria" (
    "rol_id" SMALLINT NOT NULL,
    "categoria_incidencia_id" SMALLINT NOT NULL,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_rol_categoria" PRIMARY KEY ("rol_id","categoria_incidencia_id")
);

CREATE TABLE "catalogo"."etiqueta" (
    "id" INTEGER GENERATED BY DEFAULT AS IDENTITY,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tono" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_etiqueta" PRIMARY KEY ("id")
);

CREATE TABLE "chatbot"."incidencia_etiqueta" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "incidencia_paciente_id" UUID NOT NULL,
    "etiqueta_id" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" TEXT,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_incidencia_etiqueta" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_categoria_incidencia_codigo" ON "catalogo"."categoria_incidencia"("codigo");

CREATE UNIQUE INDEX "uq_estado_incidencia_codigo" ON "catalogo"."estado_incidencia"("codigo");

CREATE UNIQUE INDEX "uq_canal_origen_codigo" ON "catalogo"."canal_origen"("codigo");

CREATE UNIQUE INDEX "uq_tipo_mensaje_codigo" ON "catalogo"."tipo_mensaje"("codigo");

CREATE UNIQUE INDEX "uq_direccion_mensaje_codigo" ON "catalogo"."direccion_mensaje"("codigo");

CREATE UNIQUE INDEX "uq_estado_mensaje_codigo" ON "catalogo"."estado_mensaje"("codigo");

CREATE UNIQUE INDEX "uq_tipo_evidencia_codigo" ON "catalogo"."tipo_evidencia"("codigo");

CREATE UNIQUE INDEX "uq_estado_conversacion_codigo" ON "catalogo"."estado_conversacion"("codigo");

CREATE UNIQUE INDEX "uq_tipo_area_codigo" ON "catalogo"."tipo_area"("codigo");

CREATE UNIQUE INDEX "uq_nivel_atencion_codigo" ON "catalogo"."nivel_atencion"("codigo");

CREATE UNIQUE INDEX "uq_motivo_archivo_codigo" ON "catalogo"."motivo_archivo"("codigo");

CREATE UNIQUE INDEX "uq_resultado_resolucion_codigo" ON "catalogo"."resultado_resolucion"("codigo");

CREATE UNIQUE INDEX "uq_area_codigo" ON "catalogo"."area"("codigo");

CREATE INDEX "ix_area_padre" ON "catalogo"."area"("padre_id");

CREATE UNIQUE INDEX "uq_establecimiento_salud_codigo_renipress" ON "catalogo"."establecimiento_salud"("codigo_renipress");

CREATE UNIQUE INDEX "uq_establecimiento_salud_area" ON "catalogo"."establecimiento_salud"("area_id");

CREATE INDEX "ix_establecimiento_salud_nombre_busqueda" ON "catalogo"."establecimiento_salud" USING GIN ("nombre_busqueda" gin_trgm_ops);

CREATE UNIQUE INDEX "uq_usuario_wa_id" ON "chatbot"."usuario"("wa_id");

CREATE INDEX "ix_usuario_dni" ON "chatbot"."usuario"("dni");

CREATE INDEX "ix_usuario_ultimo_mensaje_en" ON "chatbot"."usuario"("ultimo_mensaje_en");

CREATE UNIQUE INDEX "uq_mensaje_wa_message_id" ON "chatbot"."mensaje"("wa_message_id");

CREATE INDEX "ix_mensaje_usuario_fecha_hora" ON "chatbot"."mensaje"("usuario_id", "fecha_hora");

CREATE INDEX "ix_mensaje_fecha_hora_brin" ON "chatbot"."mensaje" USING BRIN ("fecha_hora");

CREATE UNIQUE INDEX "uq_incidencia_paciente_trace_id" ON "chatbot"."incidencia_paciente"("trace_id");

CREATE UNIQUE INDEX "uq_incidencia_paciente_codigo" ON "chatbot"."incidencia_paciente"("codigo");

CREATE INDEX "ix_incidencia_paciente_origen_fecha" ON "chatbot"."incidencia_paciente"("establecimiento_id", "fecha_creacion");

CREATE INDEX "ix_incidencia_paciente_estado_fecha" ON "chatbot"."incidencia_paciente"("estado_incidencia_id", "fecha_creacion");

CREATE INDEX "ix_incidencia_paciente_usuario_fecha" ON "chatbot"."incidencia_paciente"("usuario_id", "fecha_creacion");

CREATE INDEX "ix_incidencia_paciente_categoria" ON "chatbot"."incidencia_paciente"("categoria_id");

CREATE INDEX "ix_incidencia_paciente_auditoria_incidencia_fecha" ON "chatbot"."incidencia_paciente_auditoria"("incidencia_paciente_id", "fecha_hora");

CREATE INDEX "ix_evidencia_incidencia_paciente" ON "chatbot"."evidencia"("incidencia_paciente_id");

CREATE UNIQUE INDEX "uq_sesion_conversacion_wa_id" ON "chatbot"."sesion_conversacion"("wa_id");

CREATE INDEX "ix_sesion_conversacion_fecha_modificacion" ON "chatbot"."sesion_conversacion"("fecha_modificacion");

CREATE INDEX "ix_entrenamiento_categoria_incidencia_paciente" ON "ia"."entrenamiento_categoria"("incidencia_paciente_id");

CREATE INDEX "ix_entrenamiento_categoria_fecha_revision" ON "ia"."entrenamiento_categoria"("fecha_revision");

CREATE UNIQUE INDEX "uq_usuario_interno_correo" ON "gestion"."usuario_interno"("correo");

CREATE INDEX "ix_usuario_interno_area" ON "gestion"."usuario_interno"("area_id");

CREATE UNIQUE INDEX "uq_rol_codigo" ON "gestion"."rol"("codigo");

CREATE INDEX "ix_sesion_usuario_usuario_revocada" ON "gestion"."sesion_usuario"("usuario_interno_id", "revocada_en");

CREATE UNIQUE INDEX "uq_estado_archivo_codigo" ON "catalogo"."estado_archivo"("codigo");

CREATE UNIQUE INDEX "uq_solicitud_carga_hash_token" ON "chatbot"."solicitud_carga"("hash_token");

CREATE INDEX "ix_solicitud_carga_incidencia_paciente" ON "chatbot"."solicitud_carga"("incidencia_paciente_id");

CREATE UNIQUE INDEX "uq_archivo_recibido_evidencia" ON "chatbot"."archivo_recibido"("evidencia_id");

CREATE INDEX "ix_archivo_recibido_solicitud_estado" ON "chatbot"."archivo_recibido"("solicitud_carga_id", "estado_archivo_id");

ALTER TABLE "catalogo"."area" ADD CONSTRAINT "fk_area_tipo_area" FOREIGN KEY ("tipo_area_id") REFERENCES "catalogo"."tipo_area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "catalogo"."area" ADD CONSTRAINT "fk_area_padre" FOREIGN KEY ("padre_id") REFERENCES "catalogo"."area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "catalogo"."establecimiento_salud" ADD CONSTRAINT "fk_establecimiento_salud_nivel_atencion" FOREIGN KEY ("nivel_atencion_id") REFERENCES "catalogo"."nivel_atencion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "catalogo"."establecimiento_salud" ADD CONSTRAINT "fk_establecimiento_salud_area" FOREIGN KEY ("area_id") REFERENCES "catalogo"."area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."usuario" ADD CONSTRAINT "fk_usuario_estado_conversacion" FOREIGN KEY ("estado_conversacion_id") REFERENCES "catalogo"."estado_conversacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."mensaje" ADD CONSTRAINT "fk_mensaje_usuario" FOREIGN KEY ("usuario_id") REFERENCES "chatbot"."usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."mensaje" ADD CONSTRAINT "fk_mensaje_direccion_mensaje" FOREIGN KEY ("direccion_mensaje_id") REFERENCES "catalogo"."direccion_mensaje"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."mensaje" ADD CONSTRAINT "fk_mensaje_tipo_mensaje" FOREIGN KEY ("tipo_mensaje_id") REFERENCES "catalogo"."tipo_mensaje"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."mensaje" ADD CONSTRAINT "fk_mensaje_estado_mensaje" FOREIGN KEY ("estado_mensaje_id") REFERENCES "catalogo"."estado_mensaje"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."incidencia_paciente" ADD CONSTRAINT "fk_incidencia_paciente_canal_origen" FOREIGN KEY ("canal_origen_id") REFERENCES "catalogo"."canal_origen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."incidencia_paciente" ADD CONSTRAINT "fk_incidencia_paciente_usuario" FOREIGN KEY ("usuario_id") REFERENCES "chatbot"."usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."incidencia_paciente" ADD CONSTRAINT "fk_incidencia_paciente_mensaje" FOREIGN KEY ("mensaje_id") REFERENCES "chatbot"."mensaje"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "chatbot"."incidencia_paciente" ADD CONSTRAINT "fk_incidencia_paciente_estado_incidencia" FOREIGN KEY ("estado_incidencia_id") REFERENCES "catalogo"."estado_incidencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."incidencia_paciente" ADD CONSTRAINT "fk_incidencia_paciente_categoria" FOREIGN KEY ("categoria_id") REFERENCES "catalogo"."categoria_incidencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "chatbot"."incidencia_paciente" ADD CONSTRAINT "fk_incidencia_paciente_categoria_ia" FOREIGN KEY ("categoria_ia_id") REFERENCES "catalogo"."categoria_incidencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "chatbot"."incidencia_paciente" ADD CONSTRAINT "fk_incidencia_paciente_establecimiento_salud" FOREIGN KEY ("establecimiento_id") REFERENCES "catalogo"."establecimiento_salud"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."incidencia_paciente" ADD CONSTRAINT "fk_incidencia_paciente_area_destino" FOREIGN KEY ("area_destino_id") REFERENCES "catalogo"."area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."incidencia_paciente" ADD CONSTRAINT "fk_incidencia_paciente_motivo_archivo" FOREIGN KEY ("motivo_archivo_id") REFERENCES "catalogo"."motivo_archivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."incidencia_paciente" ADD CONSTRAINT "fk_incidencia_paciente_resultado_resolucion" FOREIGN KEY ("resultado_resolucion_id") REFERENCES "catalogo"."resultado_resolucion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."incidencia_paciente_auditoria" ADD CONSTRAINT "fk_incidencia_paciente_auditoria_incidencia_paciente" FOREIGN KEY ("incidencia_paciente_id") REFERENCES "chatbot"."incidencia_paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."incidencia_analisis" ADD CONSTRAINT "fk_incidencia_analisis_incidencia_paciente" FOREIGN KEY ("incidencia_paciente_id") REFERENCES "chatbot"."incidencia_paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."incidencia_analisis" ADD CONSTRAINT "fk_incidencia_analisis_area_mencionada" FOREIGN KEY ("area_mencionada_id") REFERENCES "catalogo"."area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."evidencia" ADD CONSTRAINT "fk_evidencia_incidencia_paciente" FOREIGN KEY ("incidencia_paciente_id") REFERENCES "chatbot"."incidencia_paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."evidencia" ADD CONSTRAINT "fk_evidencia_mensaje" FOREIGN KEY ("mensaje_id") REFERENCES "chatbot"."mensaje"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "chatbot"."evidencia" ADD CONSTRAINT "fk_evidencia_tipo_evidencia" FOREIGN KEY ("tipo_evidencia_id") REFERENCES "catalogo"."tipo_evidencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ia"."entrenamiento_categoria" ADD CONSTRAINT "fk_entrenamiento_categoria_incidencia_paciente" FOREIGN KEY ("incidencia_paciente_id") REFERENCES "chatbot"."incidencia_paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ia"."entrenamiento_categoria" ADD CONSTRAINT "fk_entrenamiento_categoria_categoria_ia" FOREIGN KEY ("categoria_ia_id") REFERENCES "catalogo"."categoria_incidencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ia"."entrenamiento_categoria" ADD CONSTRAINT "fk_entrenamiento_categoria_categoria_final" FOREIGN KEY ("categoria_final_id") REFERENCES "catalogo"."categoria_incidencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gestion"."usuario_interno" ADD CONSTRAINT "fk_usuario_interno_area" FOREIGN KEY ("area_id") REFERENCES "catalogo"."area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gestion"."rol" ADD CONSTRAINT "fk_rol_tipo_area" FOREIGN KEY ("tipo_area_id") REFERENCES "catalogo"."tipo_area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gestion"."sesion_usuario" ADD CONSTRAINT "fk_sesion_usuario_usuario_interno" FOREIGN KEY ("usuario_interno_id") REFERENCES "gestion"."usuario_interno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gestion"."usuario_rol" ADD CONSTRAINT "fk_usuario_rol_usuario_interno" FOREIGN KEY ("usuario_interno_id") REFERENCES "gestion"."usuario_interno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gestion"."usuario_rol" ADD CONSTRAINT "fk_usuario_rol_rol" FOREIGN KEY ("rol_id") REFERENCES "gestion"."rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."solicitud_carga" ADD CONSTRAINT "fk_solicitud_carga_incidencia_paciente" FOREIGN KEY ("incidencia_paciente_id") REFERENCES "chatbot"."incidencia_paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."solicitud_carga" ADD CONSTRAINT "fk_solicitud_carga_usuario" FOREIGN KEY ("usuario_id") REFERENCES "chatbot"."usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."archivo_recibido" ADD CONSTRAINT "fk_archivo_recibido_solicitud_carga" FOREIGN KEY ("solicitud_carga_id") REFERENCES "chatbot"."solicitud_carga"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."archivo_recibido" ADD CONSTRAINT "fk_archivo_recibido_estado_archivo" FOREIGN KEY ("estado_archivo_id") REFERENCES "catalogo"."estado_archivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."archivo_recibido" ADD CONSTRAINT "fk_archivo_recibido_evidencia" FOREIGN KEY ("evidencia_id") REFERENCES "chatbot"."evidencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "gestion"."rol_categoria" ADD CONSTRAINT "fk_rol_categoria_rol" FOREIGN KEY ("rol_id") REFERENCES "gestion"."rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gestion"."rol_categoria" ADD CONSTRAINT "fk_rol_categoria_categoria_incidencia" FOREIGN KEY ("categoria_incidencia_id") REFERENCES "catalogo"."categoria_incidencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."incidencia_etiqueta" ADD CONSTRAINT "fk_incidencia_etiqueta_incidencia_paciente" FOREIGN KEY ("incidencia_paciente_id") REFERENCES "chatbot"."incidencia_paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chatbot"."incidencia_etiqueta" ADD CONSTRAINT "fk_incidencia_etiqueta_etiqueta" FOREIGN KEY ("etiqueta_id") REFERENCES "catalogo"."etiqueta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
