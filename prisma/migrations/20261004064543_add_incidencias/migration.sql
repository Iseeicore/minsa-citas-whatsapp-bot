-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "gestion";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ia";

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
    "resolucion" TEXT,
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

    CONSTRAINT "pk_incidencia_paciente" PRIMARY KEY ("id")
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
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_entrenamiento_categoria" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gestion"."usuario_interno" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "nombre_completo" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
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
CREATE UNIQUE INDEX "uq_tipo_evidencia_codigo" ON "catalogo"."tipo_evidencia"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "uq_incidencia_paciente_trace_id" ON "chatbot"."incidencia_paciente"("trace_id");

-- CreateIndex
CREATE INDEX "ix_incidencia_paciente_estado_fecha" ON "chatbot"."incidencia_paciente"("estado_incidencia_id", "fecha_creacion");

-- CreateIndex
CREATE INDEX "ix_incidencia_paciente_usuario_fecha" ON "chatbot"."incidencia_paciente"("usuario_id", "fecha_creacion");

-- CreateIndex
CREATE INDEX "ix_incidencia_paciente_categoria" ON "chatbot"."incidencia_paciente"("categoria_id");

-- CreateIndex
CREATE INDEX "ix_incidencia_paciente_auditoria_incidencia_fecha" ON "chatbot"."incidencia_paciente_auditoria"("incidencia_paciente_id", "fecha_hora");

-- CreateIndex
CREATE INDEX "ix_evidencia_incidencia_paciente" ON "chatbot"."evidencia"("incidencia_paciente_id");

-- CreateIndex
CREATE INDEX "ix_entrenamiento_categoria_incidencia_paciente" ON "ia"."entrenamiento_categoria"("incidencia_paciente_id");

-- CreateIndex
CREATE INDEX "ix_entrenamiento_categoria_fecha_revision" ON "ia"."entrenamiento_categoria"("fecha_revision");

-- CreateIndex
CREATE UNIQUE INDEX "uq_usuario_interno_correo" ON "gestion"."usuario_interno"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "uq_rol_codigo" ON "gestion"."rol"("codigo");

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
ALTER TABLE "gestion"."usuario_rol" ADD CONSTRAINT "fk_usuario_rol_usuario_interno" FOREIGN KEY ("usuario_interno_id") REFERENCES "gestion"."usuario_interno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gestion"."usuario_rol" ADD CONSTRAINT "fk_usuario_rol_rol" FOREIGN KEY ("rol_id") REFERENCES "gestion"."rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Restricciones e indices parciales que Prisma no expresa.
ALTER TABLE chatbot.incidencia_paciente
  ADD CONSTRAINT ck_incidencia_paciente_confianza
    CHECK (categoria_confianza IS NULL OR (categoria_confianza >= 0 AND categoria_confianza <= 100)),
  ADD CONSTRAINT ck_incidencia_paciente_revision
    CHECK ((categoria_confirmada_en IS NULL) = (categoria_confirmada_por IS NULL)
       AND (categoria_confirmada_en IS NULL OR categoria_corregida_en IS NULL)),
  ADD CONSTRAINT ck_incidencia_paciente_anonimo
    CHECK (NOT es_anonimo OR (dni_reclamante IS NULL AND nombre_reclamante IS NULL)),
  ADD CONSTRAINT ck_incidencia_paciente_resolucion
    CHECK ((resolucion IS NULL) = (resuelto_en IS NULL) AND (resolucion IS NULL) = (resuelto_por IS NULL)),
  ADD CONSTRAINT ck_incidencia_paciente_eliminacion
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

CREATE INDEX ix_incidencia_paciente_pendiente_ia
  ON chatbot.incidencia_paciente (fecha_creacion)
  WHERE categoria_ia_id IS NULL AND activo;

CREATE INDEX ix_incidencia_paciente_pendiente_revision
  ON chatbot.incidencia_paciente (categoria_confianza, fecha_creacion)
  WHERE categoria_ia_id IS NOT NULL AND categoria_corregida_en IS NULL AND categoria_confirmada_en IS NULL AND activo;

-- Funciones de reglas, historial y replica a entrenamiento.
CREATE OR REPLACE FUNCTION public.fn_auditoria_creacion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.fecha_creacion := now();
  NEW.usuario_creacion := public.fn_actor();
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

  IF OLD.resolucion IS NOT NULL AND NEW.resolucion IS DISTINCT FROM OLD.resolucion THEN
    RAISE EXCEPTION 'incidencia_paciente: la resolucion solo se registra una vez'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.resolucion IS NULL AND NEW.resolucion IS NOT NULL THEN
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

CREATE OR REPLACE FUNCTION public.fn_replicar_categoria_entrenamiento() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO ia.entrenamiento_categoria
    (incidencia_paciente_id, texto_entrenamiento, categoria_ia_id, categoria_final_id, fue_corregida,
     categoria_confianza, version_clasificador, revisado_por, fecha_revision, usuario_creacion)
  VALUES
    (NEW.id, NEW.descripcion, NEW.categoria_ia_id, NEW.categoria_id, NEW.categoria_corregida_en IS NOT NULL,
     NEW.categoria_confianza, NEW.version_clasificador,
     coalesce(NEW.categoria_corregida_por, NEW.categoria_confirmada_por),
     coalesce(NEW.categoria_corregida_en, NEW.categoria_confirmada_en),
     coalesce(NEW.categoria_corregida_por, NEW.categoria_confirmada_por));
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  t text;
  nombre text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'catalogo.categoria_incidencia', 'catalogo.estado_incidencia', 'catalogo.canal_origen', 'catalogo.tipo_evidencia',
    'chatbot.incidencia_paciente', 'gestion.usuario_interno', 'gestion.rol'
  ] LOOP
    nombre := split_part(t, '.', 2);
    EXECUTE format('CREATE TRIGGER trg_%s_b_auditoria_ins BEFORE INSERT ON %s FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_mutable()', nombre, t);
    EXECUTE format('CREATE TRIGGER trg_%s_b_auditoria_upd BEFORE UPDATE ON %s FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.fn_auditoria_mutable()', nombre, t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['chatbot.evidencia', 'ia.entrenamiento_categoria', 'gestion.usuario_rol'] LOOP
    nombre := split_part(t, '.', 2);
    EXECUTE format('CREATE TRIGGER trg_%s_b_auditoria_ins BEFORE INSERT ON %s FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_creacion()', nombre, t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['chatbot.evidencia', 'ia.entrenamiento_categoria', 'chatbot.incidencia_paciente_auditoria'] LOOP
    nombre := split_part(t, '.', 2);
    EXECUTE format('CREATE TRIGGER trg_%s_bloqueo BEFORE UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_operacion(''todo'')', nombre, t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['chatbot.incidencia_paciente', 'gestion.usuario_interno'] LOOP
    nombre := split_part(t, '.', 2);
    EXECUTE format('CREATE TRIGGER trg_%s_bloqueo_borrado BEFORE DELETE ON %s FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_operacion(''borrado'')', nombre, t);
  END LOOP;
END;
$$;

CREATE TRIGGER trg_incidencia_paciente_a_reglas BEFORE UPDATE ON chatbot.incidencia_paciente
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.fn_reglas_incidencia();

CREATE TRIGGER trg_incidencia_paciente_c_historial AFTER INSERT OR UPDATE ON chatbot.incidencia_paciente
  FOR EACH ROW EXECUTE FUNCTION public.fn_historial_incidencia();

CREATE TRIGGER trg_incidencia_paciente_d_entrenamiento AFTER UPDATE ON chatbot.incidencia_paciente
  FOR EACH ROW WHEN ((OLD.categoria_corregida_en IS NULL AND NEW.categoria_corregida_en IS NOT NULL)
                  OR (OLD.categoria_confirmada_en IS NULL AND NEW.categoria_confirmada_en IS NOT NULL))
  EXECUTE FUNCTION public.fn_replicar_categoria_entrenamiento();

SELECT set_config('app.actor', 'sistema:migracion', true);

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

INSERT INTO catalogo.tipo_evidencia (id, codigo, nombre, descripcion) VALUES
  (1, 'IMAGEN', 'Imagen', NULL),
  (2, 'VIDEO', 'Video', NULL),
  (3, 'DOCUMENTO', 'Documento', NULL),
  (4, 'AUDIO', 'Audio', NULL);

SELECT setval(pg_get_serial_sequence('catalogo.categoria_incidencia', 'id'), 3);
SELECT setval(pg_get_serial_sequence('catalogo.estado_incidencia', 'id'), 5);
SELECT setval(pg_get_serial_sequence('catalogo.canal_origen', 'id'), 2);
SELECT setval(pg_get_serial_sequence('catalogo.tipo_evidencia', 'id'), 4);
