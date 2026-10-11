-- Migracion inicial unica. Reemplaza las migraciones anteriores (nunca llegaron a produccion).
-- Fuente: la carpeta scripts/ del diseno de la base; mantener ambas sincronizadas.

-- ===== 001_esquema.sql: Tablas, llaves, indices y esquemas (el DDL que genera Prisma desde schema.prisma).
-- uuidv7() es nativa desde PostgreSQL 18; en versiones anteriores se define aqui un equivalente (RFC 9562) para que los DEFAULT funcionen igual.
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

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "catalogo";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "chatbot";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "gestion";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ia";

-- Busqueda sin tildes ni mayusculas: pg_trgm da el indice de similitud y f_unaccent es la version inmutable de unaccent
-- (necesaria para columnas generadas e indices).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.f_unaccent(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT lower(public.unaccent('public.unaccent', $1))
$$;

-- CreateTable
CREATE TABLE "catalogo"."categoria_incidencia" (
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

    CONSTRAINT "pk_categoria_incidencia" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "catalogo"."area" (
    "id" INTEGER GENERATED BY DEFAULT AS IDENTITY NOT NULL,
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

-- CreateTable
CREATE TABLE "catalogo"."establecimiento_salud" (
    "id" INTEGER GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "codigo_renipress" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombre_busqueda" TEXT GENERATED ALWAYS AS (public.f_unaccent("nombre")) STORED,
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

-- CreateTable
CREATE TABLE "chatbot"."usuario" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "wa_id" TEXT NOT NULL,
    "profile_name" TEXT,
    "phone_number" TEXT,
    "dni" TEXT,
    "nombre_completo" TEXT,
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

-- CreateTable
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
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_mensaje" PRIMARY KEY ("id")
);

-- CreateTable
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
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "eliminado_en" TIMESTAMPTZ(3),
    "eliminado_por" TEXT,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_incidencia_paciente" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "gestion"."usuario_interno" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "nombre_completo" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "gestion"."usuario_rol" (
    "usuario_interno_id" UUID NOT NULL,
    "rol_id" SMALLINT NOT NULL,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_usuario_rol" PRIMARY KEY ("usuario_interno_id","rol_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_categoria_incidencia_codigo" ON "catalogo"."categoria_incidencia"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "uq_estado_incidencia_codigo" ON "catalogo"."estado_incidencia"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "uq_canal_origen_codigo" ON "catalogo"."canal_origen"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "uq_tipo_mensaje_codigo" ON "catalogo"."tipo_mensaje"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "uq_direccion_mensaje_codigo" ON "catalogo"."direccion_mensaje"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "uq_estado_mensaje_codigo" ON "catalogo"."estado_mensaje"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "uq_tipo_evidencia_codigo" ON "catalogo"."tipo_evidencia"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "uq_estado_conversacion_codigo" ON "catalogo"."estado_conversacion"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "uq_tipo_area_codigo" ON "catalogo"."tipo_area"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "uq_nivel_atencion_codigo" ON "catalogo"."nivel_atencion"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "uq_motivo_archivo_codigo" ON "catalogo"."motivo_archivo"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "uq_resultado_resolucion_codigo" ON "catalogo"."resultado_resolucion"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "uq_area_codigo" ON "catalogo"."area"("codigo");

-- CreateIndex
CREATE INDEX "ix_area_padre" ON "catalogo"."area"("padre_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_establecimiento_salud_codigo_renipress" ON "catalogo"."establecimiento_salud"("codigo_renipress");

-- CreateIndex
CREATE UNIQUE INDEX "uq_establecimiento_salud_area" ON "catalogo"."establecimiento_salud"("area_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_usuario_wa_id" ON "chatbot"."usuario"("wa_id");

-- CreateIndex
CREATE INDEX "ix_usuario_dni" ON "chatbot"."usuario"("dni");

-- CreateIndex
CREATE INDEX "ix_usuario_ultimo_mensaje_en" ON "chatbot"."usuario"("ultimo_mensaje_en");

-- CreateIndex
CREATE UNIQUE INDEX "uq_mensaje_wa_message_id" ON "chatbot"."mensaje"("wa_message_id");

-- CreateIndex
CREATE INDEX "ix_mensaje_usuario_fecha_hora" ON "chatbot"."mensaje"("usuario_id", "fecha_hora");

-- CreateIndex
CREATE INDEX "ix_mensaje_fecha_hora_brin" ON "chatbot"."mensaje" USING BRIN ("fecha_hora");

-- CreateIndex
CREATE UNIQUE INDEX "uq_incidencia_paciente_trace_id" ON "chatbot"."incidencia_paciente"("trace_id");

-- CreateIndex
CREATE INDEX "ix_incidencia_paciente_estado_fecha" ON "chatbot"."incidencia_paciente"("estado_incidencia_id", "fecha_creacion");

-- CreateIndex
CREATE INDEX "ix_incidencia_paciente_usuario_fecha" ON "chatbot"."incidencia_paciente"("usuario_id", "fecha_creacion");

-- CreateIndex
CREATE INDEX "ix_incidencia_paciente_categoria" ON "chatbot"."incidencia_paciente"("categoria_id");

-- CreateIndex
CREATE INDEX "ix_incidencia_paciente_origen_fecha" ON "chatbot"."incidencia_paciente"("establecimiento_id", "fecha_creacion");

-- CreateIndex
CREATE INDEX "ix_incidencia_paciente_auditoria_incidencia_fecha" ON "chatbot"."incidencia_paciente_auditoria"("incidencia_paciente_id", "fecha_hora");

-- CreateIndex
CREATE INDEX "ix_evidencia_incidencia_paciente" ON "chatbot"."evidencia"("incidencia_paciente_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_sesion_conversacion_wa_id" ON "chatbot"."sesion_conversacion"("wa_id");

-- CreateIndex
CREATE INDEX "ix_sesion_conversacion_fecha_modificacion" ON "chatbot"."sesion_conversacion"("fecha_modificacion");

-- CreateIndex
CREATE INDEX "ix_entrenamiento_categoria_incidencia_paciente" ON "ia"."entrenamiento_categoria"("incidencia_paciente_id");

-- CreateIndex
CREATE INDEX "ix_entrenamiento_categoria_fecha_revision" ON "ia"."entrenamiento_categoria"("fecha_revision");

-- CreateIndex
CREATE UNIQUE INDEX "uq_usuario_interno_correo" ON "gestion"."usuario_interno"("correo");

-- CreateIndex
CREATE INDEX "ix_usuario_interno_area" ON "gestion"."usuario_interno"("area_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_rol_codigo" ON "gestion"."rol"("codigo");

-- AddForeignKey
ALTER TABLE "chatbot"."usuario" ADD CONSTRAINT "fk_usuario_estado_conversacion" FOREIGN KEY ("estado_conversacion_id") REFERENCES "catalogo"."estado_conversacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."mensaje" ADD CONSTRAINT "fk_mensaje_usuario" FOREIGN KEY ("usuario_id") REFERENCES "chatbot"."usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."mensaje" ADD CONSTRAINT "fk_mensaje_direccion_mensaje" FOREIGN KEY ("direccion_mensaje_id") REFERENCES "catalogo"."direccion_mensaje"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."mensaje" ADD CONSTRAINT "fk_mensaje_tipo_mensaje" FOREIGN KEY ("tipo_mensaje_id") REFERENCES "catalogo"."tipo_mensaje"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."mensaje" ADD CONSTRAINT "fk_mensaje_estado_mensaje" FOREIGN KEY ("estado_mensaje_id") REFERENCES "catalogo"."estado_mensaje"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."incidencia_paciente" ADD CONSTRAINT "fk_incidencia_paciente_canal_origen" FOREIGN KEY ("canal_origen_id") REFERENCES "catalogo"."canal_origen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."incidencia_paciente" ADD CONSTRAINT "fk_incidencia_paciente_usuario" FOREIGN KEY ("usuario_id") REFERENCES "chatbot"."usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."incidencia_paciente" ADD CONSTRAINT "fk_incidencia_paciente_mensaje" FOREIGN KEY ("mensaje_id") REFERENCES "chatbot"."mensaje"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."incidencia_paciente" ADD CONSTRAINT "fk_incidencia_paciente_estado_incidencia" FOREIGN KEY ("estado_incidencia_id") REFERENCES "catalogo"."estado_incidencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."incidencia_paciente" ADD CONSTRAINT "fk_incidencia_paciente_categoria" FOREIGN KEY ("categoria_id") REFERENCES "catalogo"."categoria_incidencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."incidencia_paciente" ADD CONSTRAINT "fk_incidencia_paciente_categoria_ia" FOREIGN KEY ("categoria_ia_id") REFERENCES "catalogo"."categoria_incidencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."incidencia_paciente" ADD CONSTRAINT "fk_incidencia_paciente_establecimiento_salud" FOREIGN KEY ("establecimiento_id") REFERENCES "catalogo"."establecimiento_salud"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."incidencia_paciente" ADD CONSTRAINT "fk_incidencia_paciente_area_destino" FOREIGN KEY ("area_destino_id") REFERENCES "catalogo"."area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."incidencia_paciente" ADD CONSTRAINT "fk_incidencia_paciente_motivo_archivo" FOREIGN KEY ("motivo_archivo_id") REFERENCES "catalogo"."motivo_archivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."incidencia_paciente" ADD CONSTRAINT "fk_incidencia_paciente_resultado_resolucion" FOREIGN KEY ("resultado_resolucion_id") REFERENCES "catalogo"."resultado_resolucion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."incidencia_analisis" ADD CONSTRAINT "fk_incidencia_analisis_incidencia_paciente" FOREIGN KEY ("incidencia_paciente_id") REFERENCES "chatbot"."incidencia_paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."incidencia_analisis" ADD CONSTRAINT "fk_incidencia_analisis_area_mencionada" FOREIGN KEY ("area_mencionada_id") REFERENCES "catalogo"."area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogo"."area" ADD CONSTRAINT "fk_area_tipo_area" FOREIGN KEY ("tipo_area_id") REFERENCES "catalogo"."tipo_area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogo"."area" ADD CONSTRAINT "fk_area_padre" FOREIGN KEY ("padre_id") REFERENCES "catalogo"."area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogo"."establecimiento_salud" ADD CONSTRAINT "fk_establecimiento_salud_nivel_atencion" FOREIGN KEY ("nivel_atencion_id") REFERENCES "catalogo"."nivel_atencion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogo"."establecimiento_salud" ADD CONSTRAINT "fk_establecimiento_salud_area" FOREIGN KEY ("area_id") REFERENCES "catalogo"."area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."incidencia_paciente_auditoria" ADD CONSTRAINT "fk_incidencia_paciente_auditoria_incidencia_paciente" FOREIGN KEY ("incidencia_paciente_id") REFERENCES "chatbot"."incidencia_paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."evidencia" ADD CONSTRAINT "fk_evidencia_incidencia_paciente" FOREIGN KEY ("incidencia_paciente_id") REFERENCES "chatbot"."incidencia_paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."evidencia" ADD CONSTRAINT "fk_evidencia_mensaje" FOREIGN KEY ("mensaje_id") REFERENCES "chatbot"."mensaje"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."evidencia" ADD CONSTRAINT "fk_evidencia_tipo_evidencia" FOREIGN KEY ("tipo_evidencia_id") REFERENCES "catalogo"."tipo_evidencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia"."entrenamiento_categoria" ADD CONSTRAINT "fk_entrenamiento_categoria_incidencia_paciente" FOREIGN KEY ("incidencia_paciente_id") REFERENCES "chatbot"."incidencia_paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia"."entrenamiento_categoria" ADD CONSTRAINT "fk_entrenamiento_categoria_categoria_ia" FOREIGN KEY ("categoria_ia_id") REFERENCES "catalogo"."categoria_incidencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia"."entrenamiento_categoria" ADD CONSTRAINT "fk_entrenamiento_categoria_categoria_final" FOREIGN KEY ("categoria_final_id") REFERENCES "catalogo"."categoria_incidencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gestion"."usuario_interno" ADD CONSTRAINT "fk_usuario_interno_area" FOREIGN KEY ("area_id") REFERENCES "catalogo"."area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gestion"."rol" ADD CONSTRAINT "fk_rol_tipo_area" FOREIGN KEY ("tipo_area_id") REFERENCES "catalogo"."tipo_area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gestion"."usuario_rol" ADD CONSTRAINT "fk_usuario_rol_usuario_interno" FOREIGN KEY ("usuario_interno_id") REFERENCES "gestion"."usuario_interno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gestion"."usuario_rol" ADD CONSTRAINT "fk_usuario_rol_rol" FOREIGN KEY ("rol_id") REFERENCES "gestion"."rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===== 002_restricciones.sql: Restricciones CHECK e indices parciales que Prisma no expresa.
ALTER TABLE chatbot.incidencia_paciente
  ADD CONSTRAINT ck_incidencia_paciente_confianza
    CHECK (categoria_confianza IS NULL OR (categoria_confianza >= 0 AND categoria_confianza <= 100)),
  ADD CONSTRAINT ck_incidencia_paciente_revision
    CHECK ((categoria_confirmada_en IS NULL) = (categoria_confirmada_por IS NULL)
       AND (categoria_confirmada_en IS NULL OR categoria_corregida_en IS NULL)),
  ADD CONSTRAINT ck_incidencia_paciente_anonimo
    CHECK (NOT es_anonimo OR (dni_reclamante IS NULL AND nombre_reclamante IS NULL)),
  ADD CONSTRAINT ck_incidencia_paciente_resolucion
    CHECK ((medidas_tomadas IS NULL) = (resuelto_en IS NULL) AND (medidas_tomadas IS NULL) = (resuelto_por IS NULL)
       AND (medidas_tomadas IS NULL) = (fundamento IS NULL) AND (medidas_tomadas IS NULL) = (resultado_resolucion_id IS NULL)
       AND (medidas_tomadas IS NULL OR (char_length(btrim(medidas_tomadas)) >= 10 AND char_length(btrim(fundamento)) >= 10))),
  ADD CONSTRAINT ck_incidencia_paciente_resuelto
    CHECK (estado_incidencia_id <> 4 OR medidas_tomadas IS NOT NULL),
  ADD CONSTRAINT ck_incidencia_paciente_eliminacion
    CHECK ((activo AND eliminado_en IS NULL AND eliminado_por IS NULL)
        OR (NOT activo AND eliminado_en IS NOT NULL AND eliminado_por IS NOT NULL));

ALTER TABLE chatbot.usuario
  ADD CONSTRAINT ck_usuario_eliminacion
    CHECK ((activo AND eliminado_en IS NULL AND eliminado_por IS NULL)
        OR (NOT activo AND eliminado_en IS NOT NULL AND eliminado_por IS NOT NULL));

ALTER TABLE gestion.usuario_interno
  ADD CONSTRAINT ck_usuario_interno_eliminacion
    CHECK ((activo AND eliminado_en IS NULL AND eliminado_por IS NULL)
        OR (NOT activo AND eliminado_en IS NOT NULL AND eliminado_por IS NOT NULL));

ALTER TABLE chatbot.incidencia_paciente_auditoria
  ADD CONSTRAINT ck_incidencia_paciente_auditoria_operacion
    CHECK (operacion IN ('CREACION', 'ACTUALIZACION'));

ALTER TABLE chatbot.evidencia
  ADD CONSTRAINT ck_evidencia_tamano CHECK (tamano > 0);

ALTER TABLE catalogo.area
  ADD CONSTRAINT ck_area_padre CHECK (padre_id <> id);

ALTER TABLE catalogo.establecimiento_salud
  ADD CONSTRAINT ck_establecimiento_salud_renipress CHECK (codigo_renipress ~ '^[1-9][0-9]{0,7}$');

ALTER TABLE chatbot.incidencia_paciente
  ADD CONSTRAINT ck_incidencia_paciente_derivacion CHECK ((derivado_en IS NULL) = (derivado_por IS NULL)),
  ADD CONSTRAINT ck_incidencia_paciente_toma CHECK ((tomado_en IS NULL) = (tomado_por IS NULL)),
  ADD CONSTRAINT ck_incidencia_paciente_archivo CHECK ((archivado_en IS NULL) = (motivo_archivo_id IS NULL)),
  -- La justificacion del archivado: obligatoria (10 caracteres o mas) en los motivos manuales, DATOS_INSUFICIENTES (id 3) y
  -- NO_CORRESPONDE (id 4); en los automaticos puede faltar, y si se da debe tener 10 caracteres o mas. Solo existe archivado.
  ADD CONSTRAINT ck_incidencia_paciente_archivo_detalle
    CHECK (archivo_detalle IS NULL OR (motivo_archivo_id IS NOT NULL AND char_length(btrim(archivo_detalle)) >= 10)),
  ADD CONSTRAINT ck_incidencia_paciente_archivo_manual
    CHECK (motivo_archivo_id IS NULL OR motivo_archivo_id NOT IN (3, 4) OR archivo_detalle IS NOT NULL),
  -- Reapertura: quien, cuando y por que (10 caracteres o mas) van juntos.
  ADD CONSTRAINT ck_incidencia_paciente_reapertura
    CHECK ((reabierto_en IS NULL) = (reabierto_por IS NULL) AND (reabierto_en IS NULL) = (reabierto_motivo IS NULL)
       AND (reabierto_motivo IS NULL OR char_length(btrim(reabierto_motivo)) >= 10));

CREATE INDEX ix_establecimiento_salud_nombre_busqueda
  ON catalogo.establecimiento_salud USING GIN (nombre_busqueda gin_trgm_ops);

CREATE INDEX ix_incidencia_paciente_destino_estado_fecha
  ON chatbot.incidencia_paciente (area_destino_id, estado_incidencia_id, fecha_creacion DESC)
  INCLUDE (categoria_id)
  WHERE activo;

CREATE INDEX ix_incidencia_paciente_abierta
  ON chatbot.incidencia_paciente (area_destino_id, fecha_creacion)
  WHERE activo AND estado_incidencia_id IN (1, 2, 3, 6);

-- Paginacion por cursor (fecha_creacion y id, de la mas nueva a la mas vieja): uno para los roles con area y otro para los que ven todo.
CREATE INDEX ix_incidencia_paciente_destino_cursor
  ON chatbot.incidencia_paciente (area_destino_id, fecha_creacion DESC, id DESC)
  WHERE activo;

CREATE INDEX ix_incidencia_paciente_cursor
  ON chatbot.incidencia_paciente (fecha_creacion DESC, id DESC)
  WHERE activo;

-- Volumen esperado: cientos de miles a millones de incidencias por mes. El espacio libre en cada pagina permite
-- actualizaciones en el lugar (HOT) y el autovacuum se dispara antes. Las sesiones se reescriben en cada mensaje.
ALTER TABLE chatbot.incidencia_paciente SET (fillfactor = 85, autovacuum_vacuum_scale_factor = 0.02);
ALTER TABLE chatbot.sesion_conversacion SET (fillfactor = 70, autovacuum_vacuum_scale_factor = 0.02);

CREATE INDEX ix_incidencia_paciente_pendiente_ia
  ON chatbot.incidencia_paciente (fecha_creacion)
  WHERE categoria_ia_id IS NULL AND activo;

CREATE INDEX ix_incidencia_paciente_pendiente_revision
  ON chatbot.incidencia_paciente (categoria_confianza, fecha_creacion)
  WHERE categoria_ia_id IS NOT NULL AND categoria_corregida_en IS NULL AND categoria_confirmada_en IS NULL AND activo;

CREATE INDEX ix_mensaje_fallido
  ON chatbot.mensaje (usuario_id, fecha_hora)
  WHERE estado_mensaje_id = 5;

-- ===== 003_funciones_disparadores.sql: Funciones y disparadores: auditoria, reglas de una sola vez, historial y replica a entrenamiento.
CREATE OR REPLACE FUNCTION public.fn_actor() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('app.actor', true), ''), current_user)
$$;

CREATE OR REPLACE FUNCTION public.fn_auditoria_mutable() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_actor text := public.fn_actor();
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.fecha_creacion := now();
    NEW.usuario_creacion := v_actor;
    NEW.fecha_modificacion := now();
    NEW.usuario_modificacion := v_actor;
    NEW.version_fila := 1;
  ELSE
    NEW.fecha_creacion := OLD.fecha_creacion;
    NEW.usuario_creacion := OLD.usuario_creacion;
    NEW.fecha_modificacion := now();
    NEW.usuario_modificacion := v_actor;
    NEW.version_fila := OLD.version_fila + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_auditoria_creacion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.fecha_creacion := now();
  NEW.usuario_creacion := public.fn_actor();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_fecha_modificacion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.fecha_modificacion := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_bloquear_operacion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_ARGV[0] = 'todo' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '%.%: la operacion % no esta permitida (%)',
      TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP,
      CASE WHEN TG_ARGV[0] = 'todo' THEN 'tabla de solo insercion' ELSE 'use el borrado logico' END
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_reglas_incidencia() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_actor text := public.fn_actor();
BEGIN
  IF NEW.canal_origen_id IS DISTINCT FROM OLD.canal_origen_id
     OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
     OR NEW.mensaje_id IS DISTINCT FROM OLD.mensaje_id
     OR NEW.wa_id IS DISTINCT FROM OLD.wa_id
     OR NEW.es_anonimo IS DISTINCT FROM OLD.es_anonimo
     OR NEW.dni_reclamante IS DISTINCT FROM OLD.dni_reclamante
     OR NEW.nombre_reclamante IS DISTINCT FROM OLD.nombre_reclamante
     OR NEW.descripcion IS DISTINCT FROM OLD.descripcion
     OR NEW.trace_id IS DISTINCT FROM OLD.trace_id THEN
    RAISE EXCEPTION 'incidencia_paciente: los datos de origen no se pueden modificar'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.categoria_asignada_en IS DISTINCT FROM OLD.categoria_asignada_en
     OR NEW.categoria_corregida_en IS DISTINCT FROM OLD.categoria_corregida_en
     OR NEW.categoria_corregida_por IS DISTINCT FROM OLD.categoria_corregida_por
     OR NEW.categoria_confirmada_por IS DISTINCT FROM OLD.categoria_confirmada_por
     OR NEW.resuelto_en IS DISTINCT FROM OLD.resuelto_en
     OR NEW.resuelto_por IS DISTINCT FROM OLD.resuelto_por THEN
    RAISE EXCEPTION 'incidencia_paciente: las fechas y actores de categoria y resolucion los llena la base'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.categoria_ia_id IS NOT NULL
     AND (NEW.categoria_ia_id IS DISTINCT FROM OLD.categoria_ia_id
          OR NEW.categoria_confianza IS DISTINCT FROM OLD.categoria_confianza
          OR NEW.version_clasificador IS DISTINCT FROM OLD.version_clasificador) THEN
    RAISE EXCEPTION 'incidencia_paciente: la categoria, la confianza y la version del clasificador de la IA no se pueden modificar'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.categoria_ia_id IS NULL AND NEW.categoria_ia_id IS NOT NULL THEN
    IF NEW.categoria_id IS NOT NULL AND NEW.categoria_id IS DISTINCT FROM NEW.categoria_ia_id THEN
      RAISE EXCEPTION 'incidencia_paciente: la primera categoria debe ser la que asigna la IA'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.categoria_id := NEW.categoria_ia_id;
    NEW.categoria_asignada_en := now();
  ELSIF NEW.categoria_id IS DISTINCT FROM OLD.categoria_id THEN
    IF OLD.categoria_ia_id IS NULL THEN
      RAISE EXCEPTION 'incidencia_paciente: la categoria la asigna primero la IA'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.categoria_id IS NULL THEN
      RAISE EXCEPTION 'incidencia_paciente: la categoria no se puede quitar'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.categoria_confirmada_en IS NOT NULL THEN
      RAISE EXCEPTION 'incidencia_paciente: la categoria ya se confirmo y no se puede corregir'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.categoria_corregida_en IS NOT NULL THEN
      RAISE EXCEPTION 'incidencia_paciente: la categoria ya se corrigio una vez'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.categoria_corregida_en := now();
    NEW.categoria_corregida_por := v_actor;
  END IF;

  IF NEW.categoria_confirmada_en IS DISTINCT FROM OLD.categoria_confirmada_en THEN
    IF OLD.categoria_confirmada_en IS NOT NULL OR NEW.categoria_confirmada_en IS NULL THEN
      RAISE EXCEPTION 'incidencia_paciente: la confirmacion se registra una sola vez y no se quita'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.categoria_ia_id IS NULL THEN
      RAISE EXCEPTION 'incidencia_paciente: no hay categoria de la IA que confirmar'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.categoria_corregida_en IS NOT NULL THEN
      RAISE EXCEPTION 'incidencia_paciente: una categoria corregida no se puede confirmar'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.categoria_confirmada_en := now();
    NEW.categoria_confirmada_por := v_actor;
  END IF;

  IF OLD.medidas_tomadas IS NOT NULL AND NEW.medidas_tomadas IS DISTINCT FROM OLD.medidas_tomadas THEN
    RAISE EXCEPTION 'incidencia_paciente: la resolucion solo se registra una vez'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.medidas_tomadas IS NULL AND NEW.medidas_tomadas IS NOT NULL THEN
    NEW.resuelto_en := now();
    NEW.resuelto_por := v_actor;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_historial_incidencia() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_diff jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO chatbot.incidencia_paciente_auditoria (incidencia_paciente_id, operacion, cambios, actor, version_fila)
    VALUES (NEW.id, 'CREACION', to_jsonb(NEW), NEW.usuario_creacion, NEW.version_fila);
  ELSE
    SELECT jsonb_object_agg(n.key, jsonb_build_object('antes', o.value, 'despues', n.value))
      INTO v_diff
      FROM jsonb_each(to_jsonb(NEW)) AS n
      JOIN jsonb_each(to_jsonb(OLD)) AS o ON o.key = n.key
     WHERE n.value IS DISTINCT FROM o.value
       AND n.key NOT IN ('fecha_modificacion', 'usuario_modificacion', 'version_fila');
    IF v_diff IS NOT NULL THEN
      INSERT INTO chatbot.incidencia_paciente_auditoria (incidencia_paciente_id, operacion, cambios, actor, version_fila)
      VALUES (NEW.id, 'ACTUALIZACION', v_diff, NEW.usuario_modificacion, NEW.version_fila);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- La fila nace apta para entrenar, salvo que el caso ya este archivado con un motivo manual (DATOS_INSUFICIENTES o
-- NO_CORRESPONDE): ese caso no entra al entrenamiento.
CREATE OR REPLACE FUNCTION public.fn_replicar_categoria_entrenamiento() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_apto boolean := NOT (
    NEW.estado_incidencia_id = 7
    AND EXISTS (SELECT 1 FROM catalogo.motivo_archivo WHERE id = NEW.motivo_archivo_id AND codigo IN ('DATOS_INSUFICIENTES', 'NO_CORRESPONDE'))
  );
BEGIN
  INSERT INTO ia.entrenamiento_categoria
    (incidencia_paciente_id, texto_entrenamiento, categoria_ia_id, categoria_final_id, fue_corregida,
     categoria_confianza, version_clasificador, revisado_por, fecha_revision, apto_entrenamiento, usuario_creacion)
  VALUES
    (NEW.id, NEW.descripcion, NEW.categoria_ia_id, NEW.categoria_id, NEW.categoria_corregida_en IS NOT NULL,
     NEW.categoria_confianza, NEW.version_clasificador,
     coalesce(NEW.categoria_corregida_por, NEW.categoria_confirmada_por),
     coalesce(NEW.categoria_corregida_en, NEW.categoria_confirmada_en),
     v_apto,
     coalesce(NEW.categoria_corregida_por, NEW.categoria_confirmada_por));
  RETURN NULL;
END;
$$;

-- La tabla de entrenamiento es de solo insercion, con una unica excepcion: apto_entrenamiento, que cambia solo desde el
-- disparador de la incidencia (al archivar o reabrir el caso), nunca con una modificacion directa.
CREATE OR REPLACE FUNCTION public.fn_reglas_entrenamiento_categoria() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR (to_jsonb(NEW) - 'apto_entrenamiento') IS DISTINCT FROM (to_jsonb(OLD) - 'apto_entrenamiento')
     OR (NEW.apto_entrenamiento IS DISTINCT FROM OLD.apto_entrenamiento AND pg_trigger_depth() < 2) THEN
    RAISE EXCEPTION '%.%: la operacion % no esta permitida (tabla de solo insercion; apto_entrenamiento solo lo cambia la base al archivar o reabrir el caso)',
      TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_entrenamiento_categoria_bloqueo BEFORE UPDATE OR DELETE ON ia.entrenamiento_categoria
  FOR EACH ROW EXECUTE FUNCTION public.fn_reglas_entrenamiento_categoria();

DO $$
DECLARE
  t text;
  nombre text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'catalogo.categoria_incidencia', 'catalogo.estado_incidencia', 'catalogo.canal_origen', 'catalogo.tipo_mensaje',
    'catalogo.direccion_mensaje', 'catalogo.estado_mensaje', 'catalogo.tipo_evidencia', 'catalogo.estado_conversacion',
    'catalogo.tipo_area', 'catalogo.nivel_atencion', 'catalogo.motivo_archivo', 'catalogo.resultado_resolucion', 'catalogo.area',
    'chatbot.usuario', 'chatbot.mensaje', 'chatbot.incidencia_paciente',
    'gestion.usuario_interno', 'gestion.rol'
  ] LOOP
    nombre := split_part(t, '.', 2);
    EXECUTE format('CREATE TRIGGER trg_%s_b_auditoria_ins BEFORE INSERT ON %s FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_mutable()', nombre, t);
    EXECUTE format('CREATE TRIGGER trg_%s_b_auditoria_upd BEFORE UPDATE ON %s FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.fn_auditoria_mutable()', nombre, t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['chatbot.evidencia', 'chatbot.incidencia_analisis', 'ia.entrenamiento_categoria', 'gestion.usuario_rol'] LOOP
    nombre := split_part(t, '.', 2);
    EXECUTE format('CREATE TRIGGER trg_%s_b_auditoria_ins BEFORE INSERT ON %s FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_creacion()', nombre, t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['chatbot.evidencia', 'chatbot.incidencia_analisis', 'chatbot.incidencia_paciente_auditoria'] LOOP
    nombre := split_part(t, '.', 2);
    EXECUTE format('CREATE TRIGGER trg_%s_bloqueo BEFORE UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_operacion(''todo'')', nombre, t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['chatbot.usuario', 'chatbot.incidencia_paciente', 'gestion.usuario_interno'] LOOP
    nombre := split_part(t, '.', 2);
    EXECUTE format('CREATE TRIGGER trg_%s_bloqueo_borrado BEFORE DELETE ON %s FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_operacion(''borrado'')', nombre, t);
  END LOOP;
END;
$$;

CREATE TRIGGER trg_sesion_conversacion_b_fecha BEFORE UPDATE ON chatbot.sesion_conversacion
  FOR EACH ROW EXECUTE FUNCTION public.fn_fecha_modificacion();

CREATE TRIGGER trg_establecimiento_salud_b_auditoria_ins BEFORE INSERT ON catalogo.establecimiento_salud
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_mutable();

CREATE TRIGGER trg_establecimiento_salud_b_auditoria_upd BEFORE UPDATE ON catalogo.establecimiento_salud
  FOR EACH ROW WHEN ((OLD.codigo_renipress, OLD.nombre, OLD.nivel_atencion_id, OLD.categoria, OLD.departamento, OLD.provincia, OLD.distrito, OLD.red, OLD.area_id, OLD.activo)
                     IS DISTINCT FROM (NEW.codigo_renipress, NEW.nombre, NEW.nivel_atencion_id, NEW.categoria, NEW.departamento, NEW.provincia, NEW.distrito, NEW.red, NEW.area_id, NEW.activo))
  EXECUTE FUNCTION public.fn_auditoria_mutable();

CREATE OR REPLACE FUNCTION public.fn_reglas_incidencia_ins() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.establecimiento_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM catalogo.establecimiento_salud WHERE id = NEW.establecimiento_id AND activo) THEN
    RAISE EXCEPTION 'incidencia_paciente: el establecimiento de origen no existe o esta desactivado'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.area_destino_id IS NOT NULL THEN
    RAISE EXCEPTION 'incidencia_paciente: el area de destino se asigna despues de clasificar, no al crear'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.derivado_en IS NOT NULL OR NEW.derivado_por IS NOT NULL
     OR NEW.tomado_en IS NOT NULL OR NEW.tomado_por IS NOT NULL
     OR NEW.archivado_en IS NOT NULL OR NEW.motivo_archivo_id IS NOT NULL
     OR NEW.reabierto_en IS NOT NULL OR NEW.reabierto_por IS NOT NULL OR NEW.reabierto_motivo IS NOT NULL THEN
    RAISE EXCEPTION 'incidencia_paciente: las fechas y actores de derivacion, toma, archivado y reapertura los llena la base'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_incidencia_paciente_a_reglas_ins BEFORE INSERT ON chatbot.incidencia_paciente
  FOR EACH ROW EXECUTE FUNCTION public.fn_reglas_incidencia_ins();

CREATE TRIGGER trg_incidencia_paciente_a_reglas BEFORE UPDATE ON chatbot.incidencia_paciente
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.fn_reglas_incidencia();

CREATE TRIGGER trg_incidencia_paciente_c_historial AFTER INSERT OR UPDATE ON chatbot.incidencia_paciente
  FOR EACH ROW EXECUTE FUNCTION public.fn_historial_incidencia();

CREATE TRIGGER trg_incidencia_paciente_d_entrenamiento AFTER UPDATE ON chatbot.incidencia_paciente
  FOR EACH ROW WHEN ((OLD.categoria_corregida_en IS NULL AND NEW.categoria_corregida_en IS NOT NULL)
                  OR (OLD.categoria_confirmada_en IS NULL AND NEW.categoria_confirmada_en IS NOT NULL))
  EXECUTE FUNCTION public.fn_replicar_categoria_entrenamiento();

-- ===== 004_semillas.sql: Valores iniciales de los catalogos.
SELECT set_config('app.actor', 'sistema:migracion', false);

INSERT INTO catalogo.categoria_incidencia (id, codigo, nombre, descripcion) VALUES
  (1, 'DENUNCIA_CORRUPCION', 'Denuncia por corrupción', 'Presunto acto de corrupción'),
  (2, 'QUEJA', 'Queja', 'Inconformidad con la atención o con el personal'),
  (3, 'RECLAMO', 'Reclamo', 'Reclamo por un servicio o un derecho');

INSERT INTO catalogo.estado_incidencia (id, codigo, nombre, descripcion) VALUES
  (1, 'REGISTRADO', 'Registrado', 'Recibido por el chatbot, sin categoría'),
  (2, 'CLASIFICADO', 'Clasificado', 'La IA ya asignó una categoría'),
  (3, 'EN_GESTION', 'En gestión', 'Derivado y en atención'),
  (4, 'RESUELTO', 'Resuelto', 'Tiene resolución'),
  (5, 'ANULADO', 'Anulado', 'Anulado por el área responsable');

INSERT INTO catalogo.canal_origen (id, codigo, nombre, descripcion) VALUES
  (1, 'WHATSAPP', 'WhatsApp', 'Chatbot de WhatsApp'),
  (2, 'WEB', 'Web', 'Widget del portal');

INSERT INTO catalogo.tipo_mensaje (id, codigo, nombre, descripcion) VALUES
  (1, 'TEXTO', 'Texto', NULL),
  (2, 'IMAGEN', 'Imagen', NULL),
  (3, 'AUDIO', 'Audio', NULL),
  (4, 'DOCUMENTO', 'Documento', NULL),
  (5, 'UBICACION', 'Ubicación', NULL),
  (6, 'PLANTILLA', 'Plantilla', NULL),
  (7, 'DESCONOCIDO', 'Desconocido', NULL);

INSERT INTO catalogo.direccion_mensaje (id, codigo, nombre, descripcion) VALUES
  (1, 'ENTRANTE', 'Entrante', 'Del ciudadano al bot'),
  (2, 'SALIENTE', 'Saliente', 'Del bot al ciudadano');

INSERT INTO catalogo.estado_mensaje (id, codigo, nombre, descripcion) VALUES
  (1, 'PENDIENTE', 'Pendiente', NULL),
  (2, 'ENVIADO', 'Enviado', NULL),
  (3, 'ENTREGADO', 'Entregado', NULL),
  (4, 'LEIDO', 'Leído', NULL),
  (5, 'FALLIDO', 'Fallido', NULL);

INSERT INTO catalogo.tipo_evidencia (id, codigo, nombre, descripcion) VALUES
  (1, 'IMAGEN', 'Imagen', NULL),
  (2, 'VIDEO', 'Video', NULL),
  (3, 'DOCUMENTO', 'Documento', NULL),
  (4, 'AUDIO', 'Audio', NULL);

INSERT INTO catalogo.estado_conversacion (id, codigo, nombre, descripcion) VALUES
  (1, 'ABIERTA', 'Abierta', NULL),
  (2, 'CERRADA', 'Cerrada', NULL);

INSERT INTO catalogo.tipo_area (id, codigo, nombre, descripcion, recibe_sensibles) VALUES
  (1, 'ESTABLECIMIENTO', 'Establecimiento de salud', 'Área de un establecimiento de salud', false),
  (2, 'OTRANS', 'Oficina de transparencia', 'Área que atiende las denuncias sensibles (corrupción)', true),
  (3, 'DIRIS', 'DIRIS', 'Dirección de Redes Integradas de Salud', false),
  (4, 'INSTITUTO', 'Instituto', 'Instituto especializado', false),
  (5, 'ORGANISMO', 'Organismo o programa', 'Organismo público adscrito o programa nacional del MINSA (SIS, SUSALUD, INS, FISSAL, CENARES, PRONIS)', false);

INSERT INTO catalogo.nivel_atencion (id, codigo, nombre, descripcion) VALUES
  (1, 'I', 'Nivel I', 'Primer nivel de atención'),
  (2, 'II', 'Nivel II', 'Segundo nivel de atención'),
  (3, 'III', 'Nivel III', 'Tercer nivel de atención');

INSERT INTO catalogo.motivo_archivo (id, codigo, nombre, descripcion) VALUES
  (1, 'RESUELTA_VIGENCIA', 'Resuelta, vigencia cumplida', 'Resuelta y venció la vigencia de la resolución'),
  (2, 'VENCIDA_SIN_ATENDER', 'Vencida sin atender', 'Abierta que superó el plazo de atención'),
  (3, 'DATOS_INSUFICIENTES', 'Datos insuficientes', 'No se puede gestionar por falta de datos: lo archiva el filtro o una persona, con su justificación'),
  (4, 'NO_CORRESPONDE', 'No corresponde', 'El caso no corresponde a este establecimiento o no es una queja ni un reclamo: lo archiva una persona, con su justificación');

INSERT INTO catalogo.resultado_resolucion (id, codigo, nombre, descripcion) VALUES
  (1, 'ATENDIDO', 'Atendido', 'Se atendió lo reportado y se tomaron medidas'),
  (2, 'CERRADO', 'Cerrado', 'El caso se cierra sin más gestión');

INSERT INTO catalogo.area (id, codigo, nombre, tipo_area_id) VALUES
  (1, 'OTRANS', 'OTRANS', 2);

SELECT setval(pg_get_serial_sequence('catalogo.tipo_area', 'id'), 5);
SELECT setval(pg_get_serial_sequence('catalogo.nivel_atencion', 'id'), 3);
SELECT setval(pg_get_serial_sequence('catalogo.motivo_archivo', 'id'), 4);
SELECT setval(pg_get_serial_sequence('catalogo.resultado_resolucion', 'id'), 2);
SELECT setval(pg_get_serial_sequence('catalogo.area', 'id'), 1);
SELECT setval(pg_get_serial_sequence('catalogo.categoria_incidencia', 'id'), 3);
SELECT setval(pg_get_serial_sequence('catalogo.estado_incidencia', 'id'), 5);
SELECT setval(pg_get_serial_sequence('catalogo.canal_origen', 'id'), 2);
SELECT setval(pg_get_serial_sequence('catalogo.tipo_mensaje', 'id'), 7);
SELECT setval(pg_get_serial_sequence('catalogo.direccion_mensaje', 'id'), 2);
SELECT setval(pg_get_serial_sequence('catalogo.estado_mensaje', 'id'), 5);
SELECT setval(pg_get_serial_sequence('catalogo.tipo_evidencia', 'id'), 4);
SELECT setval(pg_get_serial_sequence('catalogo.estado_conversacion', 'id'), 2);

-- ===== 005_comentarios.sql: Descripcion de cada tabla, columna y llave foranea (diccionario de datos dentro de la base).
COMMENT ON SCHEMA catalogo IS 'Catálogos compartidos por todas las plataformas. Cada fila es un valor permitido; se usan con llave foránea en lugar de enumerados para poder agregar valores sin cambiar la estructura.';
COMMENT ON SCHEMA chatbot IS 'Plataforma 1: recepción de incidencias del paciente por WhatsApp o web. Registra al usuario, sus mensajes, lo que reporta y las evidencias.';
COMMENT ON SCHEMA gestion IS 'Plataforma 2: gestión de pacientes inconformes. Es la única que necesita usuarios internos y roles.';
COMMENT ON SCHEMA ia IS 'Plataforma 3: aprendizaje de la IA. Recibe una copia de cada categoría que una persona revisó, ya sea corrigiéndola o confirmándola.';
COMMENT ON COLUMN catalogo.canal_origen.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';
COMMENT ON COLUMN catalogo.canal_origen.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN catalogo.canal_origen.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN catalogo.canal_origen.descripcion IS 'Explicación opcional de qué significa el valor.';
COMMENT ON COLUMN catalogo.canal_origen.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN catalogo.canal_origen.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN catalogo.canal_origen.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN catalogo.canal_origen.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN catalogo.canal_origen.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN catalogo.canal_origen.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE catalogo.canal_origen IS 'Canal por el que llegó la incidencia (WhatsApp o web). Permite unificar canales en un mismo lugar.';
COMMENT ON COLUMN catalogo.categoria_incidencia.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';
COMMENT ON COLUMN catalogo.categoria_incidencia.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN catalogo.categoria_incidencia.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN catalogo.categoria_incidencia.descripcion IS 'Explicación opcional de qué significa el valor.';
COMMENT ON COLUMN catalogo.categoria_incidencia.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN catalogo.categoria_incidencia.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN catalogo.categoria_incidencia.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN catalogo.categoria_incidencia.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN catalogo.categoria_incidencia.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN catalogo.categoria_incidencia.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE catalogo.categoria_incidencia IS 'Categoría que asigna la IA a una incidencia del paciente: denuncia por corrupción, queja o reclamo. Es un catálogo con llave foránea para poder agregar categorías sin cambiar la estructura.';
COMMENT ON COLUMN catalogo.direccion_mensaje.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';
COMMENT ON COLUMN catalogo.direccion_mensaje.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN catalogo.direccion_mensaje.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN catalogo.direccion_mensaje.descripcion IS 'Explicación opcional de qué significa el valor.';
COMMENT ON COLUMN catalogo.direccion_mensaje.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN catalogo.direccion_mensaje.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN catalogo.direccion_mensaje.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN catalogo.direccion_mensaje.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN catalogo.direccion_mensaje.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN catalogo.direccion_mensaje.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE catalogo.direccion_mensaje IS 'Sentido de un mensaje: entrante (del ciudadano al bot) o saliente (del bot al ciudadano).';
COMMENT ON COLUMN catalogo.estado_conversacion.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';
COMMENT ON COLUMN catalogo.estado_conversacion.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN catalogo.estado_conversacion.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN catalogo.estado_conversacion.descripcion IS 'Explicación opcional de qué significa el valor.';
COMMENT ON COLUMN catalogo.estado_conversacion.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN catalogo.estado_conversacion.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN catalogo.estado_conversacion.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN catalogo.estado_conversacion.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN catalogo.estado_conversacion.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN catalogo.estado_conversacion.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE catalogo.estado_conversacion IS 'Si la conversación con un usuario está abierta o cerrada.';
COMMENT ON COLUMN catalogo.estado_incidencia.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';
COMMENT ON COLUMN catalogo.estado_incidencia.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN catalogo.estado_incidencia.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN catalogo.estado_incidencia.descripcion IS 'Explicación opcional de qué significa el valor.';
COMMENT ON COLUMN catalogo.estado_incidencia.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN catalogo.estado_incidencia.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN catalogo.estado_incidencia.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN catalogo.estado_incidencia.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN catalogo.estado_incidencia.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN catalogo.estado_incidencia.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE catalogo.estado_incidencia IS 'Estados por los que pasa una incidencia de paciente. Los valores son provisionales hasta que la unidad usuaria confirme su flujo.';
COMMENT ON COLUMN catalogo.estado_mensaje.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';
COMMENT ON COLUMN catalogo.estado_mensaje.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN catalogo.estado_mensaje.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN catalogo.estado_mensaje.descripcion IS 'Explicación opcional de qué significa el valor.';
COMMENT ON COLUMN catalogo.estado_mensaje.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN catalogo.estado_mensaje.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN catalogo.estado_mensaje.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN catalogo.estado_mensaje.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN catalogo.estado_mensaje.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN catalogo.estado_mensaje.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE catalogo.estado_mensaje IS 'Estado de entrega de un mensaje enviado por WhatsApp (pendiente, enviado, entregado, leído, fallido).';
COMMENT ON COLUMN catalogo.tipo_evidencia.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';
COMMENT ON COLUMN catalogo.tipo_evidencia.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN catalogo.tipo_evidencia.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN catalogo.tipo_evidencia.descripcion IS 'Explicación opcional de qué significa el valor.';
COMMENT ON COLUMN catalogo.tipo_evidencia.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN catalogo.tipo_evidencia.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN catalogo.tipo_evidencia.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN catalogo.tipo_evidencia.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN catalogo.tipo_evidencia.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN catalogo.tipo_evidencia.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE catalogo.tipo_evidencia IS 'Tipo de archivo adjunto como evidencia (imagen, video, documento, audio).';
COMMENT ON COLUMN catalogo.tipo_mensaje.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';
COMMENT ON COLUMN catalogo.tipo_mensaje.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN catalogo.tipo_mensaje.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN catalogo.tipo_mensaje.descripcion IS 'Explicación opcional de qué significa el valor.';
COMMENT ON COLUMN catalogo.tipo_mensaje.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN catalogo.tipo_mensaje.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN catalogo.tipo_mensaje.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN catalogo.tipo_mensaje.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN catalogo.tipo_mensaje.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN catalogo.tipo_mensaje.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE catalogo.tipo_mensaje IS 'Tipo de contenido de un mensaje (texto, imagen, audio, documento, ubicación, plantilla).';
COMMENT ON COLUMN chatbot.evidencia.id IS 'Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación.';
COMMENT ON COLUMN chatbot.evidencia.incidencia_paciente_id IS 'Reporte al que pertenece la evidencia.';
COMMENT ON COLUMN chatbot.evidencia.mensaje_id IS 'Mensaje de WhatsApp del que vino el archivo. Opcional.';
COMMENT ON COLUMN chatbot.evidencia.media_id IS 'Id del archivo en Meta (dato de Meta).';
COMMENT ON COLUMN chatbot.evidencia.tipo_evidencia_id IS 'Tipo de archivo.';
COMMENT ON COLUMN chatbot.evidencia.mime_type IS 'Tipo MIME del archivo.';
COMMENT ON COLUMN chatbot.evidencia.nombre_archivo IS 'Nombre original, si Meta lo entrega.';
COMMENT ON COLUMN chatbot.evidencia.tamano IS 'Tamaño en bytes. Debe ser mayor que cero.';
COMMENT ON COLUMN chatbot.evidencia.ruta IS 'Ruta que devolvió el servicio de imágenes. Nunca el archivo ni un data URI.';
COMMENT ON COLUMN chatbot.evidencia.hash_archivo IS 'Huella SHA-256 del archivo, para integridad y detección de duplicados. Queda vacía en la primera etapa.';
COMMENT ON COLUMN chatbot.evidencia.fecha_recepcion IS 'Fecha y hora (UTC) en que se recibió el archivo.';
COMMENT ON COLUMN chatbot.evidencia.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN chatbot.evidencia.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON TABLE chatbot.evidencia IS 'Archivo que el paciente adjunta a su reporte (imagen, video, documento o audio). El archivo vive en el servicio de imágenes; aquí solo queda su ruta. Solo se inserta: nunca se modifica ni se borra.

Relaciones:
- incidencia_paciente_id → chatbot.incidencia_paciente: Cada evidencia pertenece a un reporte. Sirve para listar los archivos de un caso.
- mensaje_id → chatbot.mensaje: Enlaza la evidencia con el mensaje de WhatsApp del que vino. Sirve para rastrear su origen. Si el mensaje se depura, queda en nulo.
- tipo_evidencia_id → catalogo.tipo_evidencia: Garantiza que el tipo de archivo sea uno del catálogo. Sirve para decidir cómo mostrarlo.';
COMMENT ON COLUMN chatbot.incidencia_paciente.id IS 'Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación.';
COMMENT ON COLUMN chatbot.incidencia_paciente.canal_origen_id IS 'Canal por el que llegó (WhatsApp o web).';
COMMENT ON COLUMN chatbot.incidencia_paciente.usuario_id IS 'Usuario que presentó el reporte.';
COMMENT ON COLUMN chatbot.incidencia_paciente.mensaje_id IS 'Mensaje del chat del que nació el reporte. Opcional.';
COMMENT ON COLUMN chatbot.incidencia_paciente.wa_id IS 'Id del chat (dato de Meta). Copia del usuario para filtrar sin unir tablas y para enlazar el reporte con el chat.';
COMMENT ON COLUMN chatbot.incidencia_paciente.es_anonimo IS 'Verdadero si el paciente eligió no dar su DNI ni su nombre. El id del chat se guarda igual.';
COMMENT ON COLUMN chatbot.incidencia_paciente.dni_reclamante IS 'DNI del paciente al momento de presentar el reporte (foto fija: no cambia si el usuario se actualiza después). Nulo si es anónimo.';
COMMENT ON COLUMN chatbot.incidencia_paciente.nombre_reclamante IS 'Nombre del paciente al momento de presentar el reporte. Nulo si es anónimo.';
COMMENT ON COLUMN chatbot.incidencia_paciente.descripcion IS 'Relato del paciente. Es el texto que analiza la IA. No se puede modificar.';
COMMENT ON COLUMN chatbot.incidencia_paciente.estado_incidencia_id IS 'Estado actual del reporte. Nace en REGISTRADO.';
COMMENT ON COLUMN chatbot.incidencia_paciente.trace_id IS 'Identificador del turno del chat que lo originó. Es único: una reentrega de Meta no duplica el reporte.';
COMMENT ON COLUMN chatbot.incidencia_paciente.categoria_id IS 'Categoría vigente: la que asignó la IA o, si una persona la corrigió, la corregida.';
COMMENT ON COLUMN chatbot.incidencia_paciente.categoria_ia_id IS 'Categoría que asignó la IA. Se asigna una sola vez y no se modifica; queda para medir cuánto se equivoca el modelo.';
COMMENT ON COLUMN chatbot.incidencia_paciente.categoria_confianza IS 'Puntaje de confianza (0 a 100) que dio la IA a su categoría. No es una probabilidad calibrada: sirve para ordenar la revisión y para medir al modelo. Se asigna una sola vez.';
COMMENT ON COLUMN chatbot.incidencia_paciente.version_clasificador IS 'Versión del clasificador (modelo e instrucciones) que produjo la categoría y la confianza. Se asigna junto con ellas y no se modifica; sin ella, los puntajes de modelos distintos no se pueden comparar.';
COMMENT ON COLUMN chatbot.incidencia_paciente.categoria_asignada_en IS 'Fecha y hora (UTC) en que la IA asignó la categoría. La llena la base.';
COMMENT ON COLUMN chatbot.incidencia_paciente.categoria_corregida_en IS 'Fecha y hora (UTC) de la corrección humana. Nulo si nadie corrigió. La llena la base; solo se puede corregir una vez y no si ya se confirmó.';
COMMENT ON COLUMN chatbot.incidencia_paciente.categoria_corregida_por IS 'Quién corrigió la categoría. La llena la base.';
COMMENT ON COLUMN chatbot.incidencia_paciente.categoria_confirmada_en IS 'Fecha y hora (UTC) en que una persona confirmó la categoría de la IA. La aplicación solo indica la confirmación; la fecha la fija la base. Se confirma una sola vez y no si ya fue corregida.';
COMMENT ON COLUMN chatbot.incidencia_paciente.categoria_confirmada_por IS 'Quién confirmó la categoría. La llena la base.';
COMMENT ON COLUMN chatbot.incidencia_paciente.medidas_tomadas IS 'Qué medidas se tomaron para atender el caso (10 caracteres o más). Es una de las tres partes de la resolución, junto con el fundamento y el resultado: las tres se registran juntas, una sola vez, y con ellas el caso pasa a RESUELTO.';
COMMENT ON COLUMN chatbot.incidencia_paciente.fundamento IS 'Por qué se tomaron esas medidas o se resolvió así (10 caracteres o más). Se registra junto con las medidas y el resultado.';
COMMENT ON COLUMN chatbot.incidencia_paciente.resultado_resolucion_id IS 'Resultado de la resolución: ATENDIDO o CERRADO. Se registra junto con las medidas y el fundamento.';
COMMENT ON COLUMN chatbot.incidencia_paciente.resuelto_en IS 'Fecha y hora (UTC) en que se registró la resolución (medidas, fundamento y resultado). La llena la base.';
COMMENT ON COLUMN chatbot.incidencia_paciente.resuelto_por IS 'Quién registró la resolución. La llena la base.';
COMMENT ON COLUMN chatbot.incidencia_paciente.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN chatbot.incidencia_paciente.eliminado_en IS 'Fecha y hora (UTC) del borrado lógico. Nulo mientras la fila está activa.';
COMMENT ON COLUMN chatbot.incidencia_paciente.eliminado_por IS 'Quién hizo el borrado lógico. Nulo mientras la fila está activa.';
COMMENT ON COLUMN chatbot.incidencia_paciente.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN chatbot.incidencia_paciente.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN chatbot.incidencia_paciente.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN chatbot.incidencia_paciente.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN chatbot.incidencia_paciente.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE chatbot.incidencia_paciente IS 'Incidencia que el paciente reporta al chatbot: denuncia por corrupción, queja o reclamo. Es el registro central. Nace con la categoría vacía y datos mínimos; luego la IA asigna la categoría y una persona la corrige o la confirma, una sola vez. Los datos de origen no se pueden modificar. Nunca se borra: se desactiva.

Relaciones:
- canal_origen_id → catalogo.canal_origen: Garantiza que el canal sea uno del catálogo. Sirve para unificar reportes de varios canales.
- categoria_id → catalogo.categoria_incidencia: Garantiza que la categoría vigente sea una del catálogo. Sirve para dirigir el caso según sea denuncia, queja o reclamo.
- categoria_ia_id → catalogo.categoria_incidencia: Garantiza que la categoría original de la IA sea una del catálogo. Sirve para medir cuánto se equivoca el modelo.
- estado_incidencia_id → catalogo.estado_incidencia: Garantiza que el estado sea uno del catálogo. Sirve para listar lo pendiente de cada etapa.
- mensaje_id → chatbot.mensaje: Enlaza el reporte con el mensaje del chat del que nació. Sirve para reconstruir el contexto de la conversación.
- usuario_id → chatbot.usuario: Cada reporte lo presenta un usuario. Sirve para ver todo lo que reportó una persona.';
COMMENT ON COLUMN chatbot.incidencia_paciente_auditoria.id IS 'Número secuencial del evento; da el orden de los cambios.';
COMMENT ON COLUMN chatbot.incidencia_paciente_auditoria.incidencia_paciente_id IS 'Incidencia a la que corresponde el cambio.';
COMMENT ON COLUMN chatbot.incidencia_paciente_auditoria.operacion IS 'CREACION (guarda la fila completa) o ACTUALIZACION (guarda solo lo que cambió).';
COMMENT ON COLUMN chatbot.incidencia_paciente_auditoria.cambios IS 'Detalle en JSON. En una actualización, cada campo con su valor anterior y el nuevo. Hereda la sensibilidad de la tabla de origen.';
COMMENT ON COLUMN chatbot.incidencia_paciente_auditoria.actor IS 'Quién hizo el cambio.';
COMMENT ON COLUMN chatbot.incidencia_paciente_auditoria.version_fila IS 'Versión que tenía la incidencia después del cambio.';
COMMENT ON COLUMN chatbot.incidencia_paciente_auditoria.fecha_hora IS 'Fecha y hora (UTC) del cambio, con el reloj de la base.';
COMMENT ON TABLE chatbot.incidencia_paciente_auditoria IS 'Historial de cambios de cada incidencia de paciente: qué cambió, valor anterior y nuevo, quién y cuándo. Solo se agrega; nunca se modifica ni se borra. La llena un disparador.

Relaciones:
- incidencia_paciente_id → chatbot.incidencia_paciente: Cada evento del historial pertenece a una incidencia. Sirve para reconstruir la vida completa de un reporte.';
COMMENT ON COLUMN chatbot.mensaje.id IS 'Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación.';
COMMENT ON COLUMN chatbot.mensaje.usuario_id IS 'Usuario dueño de la conversación a la que pertenece el mensaje.';
COMMENT ON COLUMN chatbot.mensaje.direccion_mensaje_id IS 'Sentido del mensaje (entrante o saliente).';
COMMENT ON COLUMN chatbot.mensaje.tipo_mensaje_id IS 'Tipo de contenido del mensaje.';
COMMENT ON COLUMN chatbot.mensaje.contenido IS 'Texto del mensaje, cuando aplica.';
COMMENT ON COLUMN chatbot.mensaje.media_id IS 'Id del archivo en Meta (dato de Meta). No es una URL.';
COMMENT ON COLUMN chatbot.mensaje.wa_message_id IS 'Id del mensaje en WhatsApp (dato de Meta). Es único: evita procesar dos veces una reentrega de Meta.';
COMMENT ON COLUMN chatbot.mensaje.estado_mensaje_id IS 'Estado de entrega del mensaje. Lo actualiza Meta con sus avisos de entrega.';
COMMENT ON COLUMN chatbot.mensaje.fecha_hora IS 'Momento real del mensaje según WhatsApp. Es la fecha del evento y no se confunde con fecha_creacion, que es la de inserción.';
COMMENT ON COLUMN chatbot.mensaje.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN chatbot.mensaje.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN chatbot.mensaje.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN chatbot.mensaje.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN chatbot.mensaje.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE chatbot.mensaje IS 'Mensaje de la conversación, entrante o saliente. Es la tabla de mayor volumen: se estiman decenas de millones de filas por mes.

Relaciones:
- direccion_mensaje_id → catalogo.direccion_mensaje: Garantiza que el sentido sea entrante o saliente. Sirve para distinguir lo que dijo el ciudadano de lo que respondió el bot.
- estado_mensaje_id → catalogo.estado_mensaje: Garantiza que el estado de entrega sea uno del catálogo. Sirve para reintentar o reportar mensajes fallidos.
- tipo_mensaje_id → catalogo.tipo_mensaje: Garantiza que el tipo de contenido sea uno conocido. Sirve para decidir cómo mostrar o procesar el mensaje.
- usuario_id → chatbot.usuario: Cada mensaje pertenece a un usuario. Sirve para armar la conversación de un usuario en orden.';
COMMENT ON COLUMN chatbot.sesion_conversacion.id IS 'Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación.';
COMMENT ON COLUMN chatbot.sesion_conversacion.wa_id IS 'Id del chat. Único: hay una sesión por usuario. No tiene llave foránea hacia usuario porque la sesión puede existir antes que el usuario.';
COMMENT ON COLUMN chatbot.sesion_conversacion.estado IS 'Estado actual del flujo conversacional (por ejemplo cita_awaiting_dni). Es texto y no catálogo porque lo define el código del bot y tiene más de 60 valores.';
COMMENT ON COLUMN chatbot.sesion_conversacion.slots IS 'Datos recolectados durante el flujo, en JSON. La forma la garantiza el código del bot.';
COMMENT ON COLUMN chatbot.sesion_conversacion.contadores IS 'Contadores internos del flujo (reintentos, intentos de código), en JSON.';
COMMENT ON COLUMN chatbot.sesion_conversacion.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN chatbot.sesion_conversacion.fecha_modificacion IS 'Fecha y hora (UTC) de la última actividad. Sirve para purgar sesiones inactivas. La llena un disparador.';
COMMENT ON TABLE chatbot.sesion_conversacion IS 'Estado temporal del flujo conversacional de cada usuario (en qué paso va y qué datos ha dado). Es efímera: se reescribe en cada turno y se purga cuando queda inactiva. No guarda imágenes.';
COMMENT ON COLUMN chatbot.usuario.id IS 'Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación.';
COMMENT ON COLUMN chatbot.usuario.wa_id IS 'Id del chat de WhatsApp (dato de Meta; es un identificador opaco, no un teléfono). Es la clave de negocio del usuario.';
COMMENT ON COLUMN chatbot.usuario.profile_name IS 'Nombre de perfil de WhatsApp (dato de Meta). Opcional.';
COMMENT ON COLUMN chatbot.usuario.phone_number IS 'Teléfono (dato de Meta). Casi siempre vacío porque la cuenta usa identificadores BSUID. Nunca se usa como clave.';
COMMENT ON COLUMN chatbot.usuario.dni IS 'DNI del usuario, cuando lo da y se valida. No es único: una misma persona puede escribir desde dos chats.';
COMMENT ON COLUMN chatbot.usuario.nombre_completo IS 'Nombre completo devuelto por RENIEC al validar el DNI.';
COMMENT ON COLUMN chatbot.usuario.estado_conversacion_id IS 'Estado de la conversación (abierta o cerrada).';
COMMENT ON COLUMN chatbot.usuario.ultimo_mensaje_en IS 'Fecha y hora (UTC) del último mensaje, entrante o saliente. Ordena la bandeja de conversaciones.';
COMMENT ON COLUMN chatbot.usuario.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN chatbot.usuario.eliminado_en IS 'Fecha y hora (UTC) del borrado lógico. Nulo mientras la fila está activa.';
COMMENT ON COLUMN chatbot.usuario.eliminado_por IS 'Quién hizo el borrado lógico. Nulo mientras la fila está activa.';
COMMENT ON COLUMN chatbot.usuario.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN chatbot.usuario.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN chatbot.usuario.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN chatbot.usuario.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN chatbot.usuario.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE chatbot.usuario IS 'Persona que escribe al chatbot, identificada por el id de su chat de WhatsApp. Reúne sus datos de contacto y el estado de su conversación. Nunca se borra: se desactiva.

Relaciones:
- estado_conversacion_id → catalogo.estado_conversacion: Garantiza que el estado de la conversación sea uno del catálogo. Sirve para saber si el usuario tiene una conversación abierta.';
COMMENT ON COLUMN gestion.rol.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';
COMMENT ON COLUMN gestion.rol.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN gestion.rol.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN gestion.rol.descripcion IS 'Explicación opcional de qué significa el valor.';
COMMENT ON COLUMN gestion.rol.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN gestion.rol.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN gestion.rol.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN gestion.rol.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN gestion.rol.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN gestion.rol.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE gestion.rol IS 'Rol que puede tener un usuario interno. Es la única plataforma con roles.';
COMMENT ON COLUMN gestion.usuario_interno.id IS 'Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación.';
COMMENT ON COLUMN gestion.usuario_interno.nombre_completo IS 'Nombre completo de la persona.';
COMMENT ON COLUMN gestion.usuario_interno.correo IS 'Correo institucional. Es único.';
COMMENT ON COLUMN gestion.usuario_interno.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN gestion.usuario_interno.eliminado_en IS 'Fecha y hora (UTC) del borrado lógico. Nulo mientras la fila está activa.';
COMMENT ON COLUMN gestion.usuario_interno.eliminado_por IS 'Quién hizo el borrado lógico. Nulo mientras la fila está activa.';
COMMENT ON COLUMN gestion.usuario_interno.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN gestion.usuario_interno.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN gestion.usuario_interno.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN gestion.usuario_interno.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN gestion.usuario_interno.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE gestion.usuario_interno IS 'Persona de la institución que gestiona los casos. Es distinta del usuario de WhatsApp. Nunca se borra: se desactiva.';
COMMENT ON COLUMN gestion.usuario_rol.usuario_interno_id IS 'Usuario interno que recibe el rol.';
COMMENT ON COLUMN gestion.usuario_rol.rol_id IS 'Rol que se le asigna.';
COMMENT ON COLUMN gestion.usuario_rol.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN gestion.usuario_rol.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON TABLE gestion.usuario_rol IS 'Relación entre usuarios internos y roles: un usuario puede tener varios roles y un rol lo tienen varios usuarios. Solo se inserta.

Relaciones:
- rol_id → gestion.rol: Enlaza la asignación con el rol. Sirve para saber qué personas tienen un rol.
- usuario_interno_id → gestion.usuario_interno: Enlaza la asignación con el usuario interno. Sirve para saber qué roles tiene una persona.';
COMMENT ON COLUMN ia.entrenamiento_categoria.id IS 'Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación.';
COMMENT ON COLUMN ia.entrenamiento_categoria.incidencia_paciente_id IS 'Incidencia cuya categoría se revisó.';
COMMENT ON COLUMN ia.entrenamiento_categoria.texto_entrenamiento IS 'Copia del relato del paciente en el momento de la revisión. En la primera etapa va sin depurar; ver la lista de la segunda etapa.';
COMMENT ON COLUMN ia.entrenamiento_categoria.categoria_ia_id IS 'Categoría que había asignado la IA.';
COMMENT ON COLUMN ia.entrenamiento_categoria.categoria_final_id IS 'Categoría que quedó tras la revisión: la misma de la IA si se confirmó, otra si se corrigió.';
COMMENT ON COLUMN ia.entrenamiento_categoria.fue_corregida IS 'Verdadero si la persona corrigió la categoría de la IA; falso si la confirmó.';
COMMENT ON COLUMN ia.entrenamiento_categoria.categoria_confianza IS 'Puntaje de confianza que había dado la IA a su categoría.';
COMMENT ON COLUMN ia.entrenamiento_categoria.version_clasificador IS 'Versión del clasificador que produjo la categoría de la IA.';
COMMENT ON COLUMN ia.entrenamiento_categoria.revisado_por IS 'Quién revisó, con el formato tipo:detalle.';
COMMENT ON COLUMN ia.entrenamiento_categoria.fecha_revision IS 'Fecha y hora (UTC) de la revisión.';
COMMENT ON COLUMN ia.entrenamiento_categoria.apto_entrenamiento IS 'Verdadero si la fila puede usarse para entrenar al modelo. La base la pone en falso cuando el caso se archiva por un motivo manual (datos insuficientes o no corresponde) y vuelve a verdadero si el caso se reabre. Es lo único de esta tabla que cambia, y solo lo cambia la base.';
COMMENT ON COLUMN ia.entrenamiento_categoria.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN ia.entrenamiento_categoria.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON TABLE ia.entrenamiento_categoria IS 'Copia de cada categoría que una persona revisó (corrigiéndola o confirmándola): lo que dijo la IA, lo que se decidió y el texto del caso. Registrar también las confirmaciones permite medir cuánto acierta el modelo y calibrar su puntaje. La llena un disparador y solo se inserta; lo único que cambia después es apto_entrenamiento, que la base baja cuando el caso se archiva por un motivo manual.

Relaciones:
- categoria_final_id → catalogo.categoria_incidencia: Garantiza que la categoría decidida sea una del catálogo. Es la respuesta correcta con la que se mejora el modelo.
- categoria_ia_id → catalogo.categoria_incidencia: Garantiza que la categoría de la IA sea una del catálogo. Sirve para medir errores del modelo.
- incidencia_paciente_id → chatbot.incidencia_paciente: Enlaza la copia de entrenamiento con el caso original. Sirve para volver al expediente completo.';

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['catalogo.tipo_area', 'catalogo.nivel_atencion', 'catalogo.motivo_archivo', 'catalogo.resultado_resolucion', 'catalogo.area', 'catalogo.establecimiento_salud'] LOOP
    EXECUTE format('COMMENT ON COLUMN %s.nombre IS %L', t, 'Nombre legible del valor, para mostrar en pantalla.');
    EXECUTE format('COMMENT ON COLUMN %s.activo IS %L', t, 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.');
    EXECUTE format('COMMENT ON COLUMN %s.version_fila IS %L', t, 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.');
    EXECUTE format('COMMENT ON COLUMN %s.fecha_creacion IS %L', t, 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.');
    EXECUTE format('COMMENT ON COLUMN %s.usuario_creacion IS %L', t, 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.');
    EXECUTE format('COMMENT ON COLUMN %s.fecha_modificacion IS %L', t, 'Fecha y hora (UTC) de la última modificación. La llena un disparador.');
    EXECUTE format('COMMENT ON COLUMN %s.usuario_modificacion IS %L', t, 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.');
  END LOOP;

  FOREACH t IN ARRAY ARRAY['catalogo.tipo_area', 'catalogo.nivel_atencion', 'catalogo.motivo_archivo', 'catalogo.resultado_resolucion'] LOOP
    EXECUTE format('COMMENT ON COLUMN %s.id IS %L', t, 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.');
    EXECUTE format('COMMENT ON COLUMN %s.descripcion IS %L', t, 'Explicación opcional de qué significa el valor.');
  END LOOP;

  FOREACH t IN ARRAY ARRAY['catalogo.tipo_area', 'catalogo.nivel_atencion', 'catalogo.motivo_archivo', 'catalogo.resultado_resolucion', 'catalogo.area'] LOOP
    EXECUTE format('COMMENT ON COLUMN %s.codigo IS %L', t, 'Código estable y único del valor. Es el que usa el código de la aplicación.');
  END LOOP;
END;
$$;

COMMENT ON COLUMN catalogo.tipo_area.recibe_sensibles IS 'Verdadero si las áreas de este tipo pueden recibir incidencias de categorías sensibles (hoy, solo OTRANS). La base impide derivar un caso sensible a un área cuyo tipo no lo reciba.';
COMMENT ON TABLE catalogo.tipo_area IS 'Tipo de área a la que se puede derivar una incidencia: establecimiento, OTRANS, DIRIS, instituto o sede central. Define además qué tipos reciben denuncias sensibles y a qué tipo pertenece cada rol de gestión.';
COMMENT ON TABLE catalogo.nivel_atencion IS 'Nivel de atención de un establecimiento de salud (I, II o III).';
COMMENT ON TABLE catalogo.motivo_archivo IS 'Por qué se archivó una incidencia: resuelta con la vigencia cumplida, vencida sin atender (ambos automáticos), con datos insuficientes para gestionarla o porque no corresponde (ambos manuales, con justificación escrita).';
COMMENT ON TABLE catalogo.resultado_resolucion IS 'Resultado con que se resuelve un caso: atendido (se tomaron medidas) o cerrado (se cierra sin más gestión).';

COMMENT ON COLUMN catalogo.area.id IS 'Identificador numérico de la fila, generado por la base.';
COMMENT ON COLUMN catalogo.area.tipo_area_id IS 'Tipo del área.';
COMMENT ON COLUMN catalogo.area.padre_id IS 'Área de la que depende, si tiene una (por ejemplo la DIRIS de un establecimiento). Nulo en la cima. No puede ser la misma área.';
COMMENT ON TABLE catalogo.area IS 'Área que atiende incidencias: cada establecimiento de salud tiene la suya, y existen además áreas como OTRANS o la sede central. A una incidencia se la deriva a un área y los usuarios internos pertenecen a una. Las áreas pueden depender de otra (padre).

Relaciones:
- padre_id → catalogo.area: Enlaza el área con la que depende. Sirve para recorrer la jerarquía.
- tipo_area_id → catalogo.tipo_area: Garantiza que el tipo sea uno del catálogo. Sirve para saber si el área recibe denuncias sensibles.';

COMMENT ON COLUMN catalogo.establecimiento_salud.id IS 'Identificador numérico de la fila, generado por la base.';
COMMENT ON COLUMN catalogo.establecimiento_salud.codigo_renipress IS 'Código RENIPRESS del establecimiento: de uno a ocho dígitos, SIN ceros a la izquierda (forma canónica: 6206, no 00006206, igual que el catálogo de citas del bot). Es único. Quien cargue o lea el código debe quitar los ceros iniciales antes de guardar o comparar.';
COMMENT ON COLUMN catalogo.establecimiento_salud.nombre_busqueda IS 'Nombre sin tildes y en minúscula, que calcula la base. Es el que usa la búsqueda por similitud (índice de trigramas); no se escribe.';
COMMENT ON COLUMN catalogo.establecimiento_salud.nivel_atencion_id IS 'Nivel de atención del establecimiento (I, II o III). Si la fuente no lo trae: los hospitales son de nivel II o III y los demás establecimientos de nivel I.';
COMMENT ON COLUMN catalogo.establecimiento_salud.categoria IS 'Categoría oficial del establecimiento (por ejemplo I-1, I-4, II-2, III-1, III-E). Texto libre porque la fuente es el MINSA y puede cambiar; el nivel de atención va aparte para filtrar.';
COMMENT ON COLUMN catalogo.establecimiento_salud.departamento IS 'Departamento donde queda el establecimiento.';
COMMENT ON COLUMN catalogo.establecimiento_salud.provincia IS 'Provincia donde queda el establecimiento.';
COMMENT ON COLUMN catalogo.establecimiento_salud.distrito IS 'Distrito donde queda el establecimiento.';
COMMENT ON COLUMN catalogo.establecimiento_salud.red IS 'Red de salud a la que pertenece el establecimiento.';
COMMENT ON COLUMN catalogo.establecimiento_salud.area_id IS 'Área propia del establecimiento, a la que se le derivan sus incidencias. Cada establecimiento tiene una sola área y cada área sirve a un solo establecimiento.';
COMMENT ON TABLE catalogo.establecimiento_salud IS 'Establecimiento de salud del padrón RENIPRESS. Es el origen de una incidencia (donde ocurrió el hecho) y se carga desde el padrón, no con la migración. Se busca por nombre sin tildes con un índice de similitud.

Relaciones:
- area_id → catalogo.area: Enlaza el establecimiento con su área. Sirve para derivarle sus incidencias.
- nivel_atencion_id → catalogo.nivel_atencion: Garantiza que el nivel sea uno del catálogo. Sirve para filtrar por complejidad.';

COMMENT ON COLUMN chatbot.incidencia_paciente.establecimiento_id IS 'Establecimiento de salud donde ocurrió el hecho (dato de origen). Opcional. Una vez asignado no se puede cambiar; solo la carga de datos de la migración puede completarlo cuando estaba vacío.';
COMMENT ON COLUMN chatbot.incidencia_paciente.area_destino_id IS 'Área a la que se derivó o se asignó el caso. La base la asigna sola: la de OTRANS cuando la categoría es sensible y existe una única área que las recibe, y la del establecimiento de origen cuando un caso no sensible (queja, reclamo u otro) se clasifica sin destino o se corrige de sensible a no sensible mientras no se gestiona. Solo se reasigna mientras el caso está CLASIFICADO o DERIVADO, y un caso sensible solo puede estar en un área que reciba casos sensibles.';
COMMENT ON COLUMN chatbot.incidencia_paciente.derivado_en IS 'Fecha y hora (UTC) en que el caso pasó a DERIVADO (o se reasignó su área). La llena la base.';
COMMENT ON COLUMN chatbot.incidencia_paciente.derivado_por IS 'Quién derivó el caso. La llena la base con el actor declarado.';
COMMENT ON COLUMN chatbot.incidencia_paciente.tomado_en IS 'Fecha y hora (UTC) en que el caso pasó a EN_GESTION. La llena la base.';
COMMENT ON COLUMN chatbot.incidencia_paciente.tomado_por IS 'Quién tomó el caso en gestión. La llena la base con el actor declarado.';
COMMENT ON COLUMN chatbot.incidencia_paciente.motivo_archivo_id IS 'Por qué se archivó el caso. Nulo mientras no esté archivado. La base lo deduce en los archivados automáticos (resuelto: vigencia cumplida; vencido sin resolución: sin atender); en los manuales (datos insuficientes o no corresponde) lo indica quien archiva, una persona o, solo por datos insuficientes, el filtro del sistema.';
COMMENT ON COLUMN chatbot.incidencia_paciente.archivado_en IS 'Fecha y hora (UTC) en que el caso pasó a ARCHIVADO. La llena la base. Se limpia al reabrir el caso.';
COMMENT ON COLUMN chatbot.incidencia_paciente.archivo_detalle IS 'Justificación escrita de quien archivó el caso (10 caracteres o más). Obligatoria en los motivos manuales (datos insuficientes y no corresponde); en los automáticos puede quedar vacía. Se limpia al reabrir el caso; el historial queda en la auditoría.';
COMMENT ON COLUMN chatbot.incidencia_paciente.reabierto_en IS 'Fecha y hora (UTC) en que el caso se reabrió por última vez (de ARCHIVADO a EN_GESTION). La llena la base. Nulo si nunca se reabrió.';
COMMENT ON COLUMN chatbot.incidencia_paciente.reabierto_por IS 'Quién reabrió el caso la última vez. La llena la base con el actor declarado.';
COMMENT ON COLUMN chatbot.incidencia_paciente.reabierto_motivo IS 'Por qué se reabrió el caso (10 caracteres o más). Obligatorio al reabrir. Solo se reabre un caso archivado por datos insuficientes, no corresponde o vencido sin atender, nunca uno archivado por vigencia de la resolución. El historial de reaperturas queda en la auditoría.';

COMMENT ON COLUMN chatbot.incidencia_analisis.incidencia_paciente_id IS 'Incidencia analizada. Es la llave de la tabla: hay un análisis por incidencia.';
COMMENT ON COLUMN chatbot.incidencia_analisis.version_reglas IS 'Versión del conjunto de reglas que produjo el análisis. Sin ella, los puntajes de versiones distintas no se pueden comparar.';
COMMENT ON COLUMN chatbot.incidencia_analisis.puntaje IS 'Puntaje que dieron las reglas al caso. Sirve para ordenar la revisión.';
COMMENT ON COLUMN chatbot.incidencia_analisis.senales IS 'Señales que detectaron las reglas, en JSON. No lleva índice: solo se lee junto con el caso.';
COMMENT ON COLUMN chatbot.incidencia_analisis.cargo_mencionado IS 'Cargo de la persona señalada en el relato, si el texto lo menciona.';
COMMENT ON COLUMN chatbot.incidencia_analisis.area_mencionada_id IS 'Área que el relato menciona, si se pudo reconocer.';
COMMENT ON COLUMN chatbot.incidencia_analisis.nombre_mencionado IS 'Nombre de la persona señalada en el relato, si el texto lo menciona. Está aquí y no en la incidencia a propósito, para que no pase al historial de cambios.';
COMMENT ON COLUMN chatbot.incidencia_analisis.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN chatbot.incidencia_analisis.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON TABLE chatbot.incidencia_analisis IS 'Análisis automático de una incidencia (puntaje y señales de las reglas, y lo que el relato menciona: cargo, área y nombre). Uno por incidencia; solo se inserta. El nombre mencionado vive aquí y no en la incidencia para que no se copie al historial de cambios.

Relaciones:
- area_mencionada_id → catalogo.area: Garantiza que el área mencionada sea una del catálogo. Sirve para ubicar el área señalada.
- incidencia_paciente_id → chatbot.incidencia_paciente: Cada análisis pertenece a una incidencia. Sirve para unir el análisis con el caso.';

COMMENT ON COLUMN gestion.rol.tipo_area_id IS 'Tipo de área a la que pertenece el rol. Nulo solo para el administrador, que vale en cualquier área o sin ella. El gestor, el establecimiento y OTRANS tienen tipo de área: el usuario debe tener un área de ese tipo (el gestor, siempre un establecimiento).';
COMMENT ON COLUMN gestion.usuario_interno.area_id IS 'Área a la que pertenece el usuario. Obligatoria para los roles con tipo de área (gestor, establecimiento y OTRANS); opcional para el administrador. Cambiarla cierra las sesiones abiertas del usuario, y su tipo debe coincidir con el de sus roles que tengan tipo de área. Un establecimiento admite como máximo 3 usuarios activos.';
