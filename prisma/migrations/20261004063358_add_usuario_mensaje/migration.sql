-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "catalogo";

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

-- CreateIndex
CREATE UNIQUE INDEX "uq_direccion_mensaje_codigo" ON "catalogo"."direccion_mensaje"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "uq_tipo_mensaje_codigo" ON "catalogo"."tipo_mensaje"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "uq_estado_mensaje_codigo" ON "catalogo"."estado_mensaje"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "uq_estado_conversacion_codigo" ON "catalogo"."estado_conversacion"("codigo");

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


-- Funciones de auditoria compartidas: la base firma quien y cuando, con el actor que declara la aplicacion (app.actor) o, si no, el rol de conexion.
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

ALTER TABLE "chatbot"."usuario"
  ADD CONSTRAINT ck_usuario_eliminacion
    CHECK ((activo AND eliminado_en IS NULL AND eliminado_por IS NULL)
        OR (NOT activo AND eliminado_en IS NOT NULL AND eliminado_por IS NOT NULL));

CREATE INDEX ix_mensaje_fallido
  ON "chatbot"."mensaje" (usuario_id, fecha_hora)
  WHERE estado_mensaje_id = 5;

DO $$
DECLARE
  t text;
  nombre text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'catalogo.direccion_mensaje', 'catalogo.tipo_mensaje', 'catalogo.estado_mensaje', 'catalogo.estado_conversacion',
    'chatbot.usuario', 'chatbot.mensaje'
  ] LOOP
    nombre := split_part(t, '.', 2);
    EXECUTE format('CREATE TRIGGER trg_%s_b_auditoria_ins BEFORE INSERT ON %s FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_mutable()', nombre, t);
    EXECUTE format('CREATE TRIGGER trg_%s_b_auditoria_upd BEFORE UPDATE ON %s FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.fn_auditoria_mutable()', nombre, t);
  END LOOP;
END;
$$;

CREATE TRIGGER trg_usuario_bloqueo_borrado BEFORE DELETE ON "chatbot"."usuario"
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_operacion('borrado');

SELECT set_config('app.actor', 'sistema:migracion', true);

INSERT INTO catalogo.direccion_mensaje (id, codigo, nombre, descripcion) VALUES
  (1, 'ENTRANTE', 'Entrante', 'Del ciudadano al bot'),
  (2, 'SALIENTE', 'Saliente', 'Del bot al ciudadano');

INSERT INTO catalogo.tipo_mensaje (id, codigo, nombre, descripcion) VALUES
  (1, 'TEXTO', 'Texto', NULL),
  (2, 'IMAGEN', 'Imagen', NULL),
  (3, 'AUDIO', 'Audio', NULL),
  (4, 'DOCUMENTO', 'Documento', NULL),
  (5, 'UBICACION', 'Ubicación', NULL),
  (6, 'PLANTILLA', 'Plantilla', NULL),
  (7, 'DESCONOCIDO', 'Desconocido', NULL);

INSERT INTO catalogo.estado_mensaje (id, codigo, nombre, descripcion) VALUES
  (1, 'PENDIENTE', 'Pendiente', NULL),
  (2, 'ENVIADO', 'Enviado', NULL),
  (3, 'ENTREGADO', 'Entregado', NULL),
  (4, 'LEIDO', 'Leído', NULL),
  (5, 'FALLIDO', 'Fallido', NULL);

INSERT INTO catalogo.estado_conversacion (id, codigo, nombre, descripcion) VALUES
  (1, 'ABIERTA', 'Abierta', NULL),
  (2, 'CERRADA', 'Cerrada', NULL);

SELECT setval(pg_get_serial_sequence('catalogo.direccion_mensaje', 'id'), 2);
SELECT setval(pg_get_serial_sequence('catalogo.tipo_mensaje', 'id'), 7);
SELECT setval(pg_get_serial_sequence('catalogo.estado_mensaje', 'id'), 5);
SELECT setval(pg_get_serial_sequence('catalogo.estado_conversacion', 'id'), 2);
