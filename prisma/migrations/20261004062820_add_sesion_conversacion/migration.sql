-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "chatbot";

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

-- CreateIndex
CREATE UNIQUE INDEX "uq_sesion_conversacion_wa_id" ON "chatbot"."sesion_conversacion"("wa_id");

-- CreateIndex
CREATE INDEX "ix_sesion_conversacion_fecha_modificacion" ON "chatbot"."sesion_conversacion"("fecha_modificacion");


-- La fecha de modificacion la renueva la base en cada UPDATE: el guardia de inactividad de la sesion depende de ella.
CREATE OR REPLACE FUNCTION public.fn_fecha_modificacion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.fecha_modificacion := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sesion_conversacion_b_fecha BEFORE UPDATE ON "chatbot"."sesion_conversacion"
  FOR EACH ROW EXECUTE FUNCTION public.fn_fecha_modificacion();
