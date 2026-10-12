ALTER TABLE "chatbot"."mensaje" ADD COLUMN "procesado_en" TIMESTAMPTZ(3);

ALTER TABLE chatbot.mensaje DISABLE TRIGGER trg_mensaje_b_auditoria_upd;
UPDATE chatbot.mensaje SET procesado_en = fecha_creacion WHERE procesado_en IS NULL;
ALTER TABLE chatbot.mensaje ENABLE TRIGGER trg_mensaje_b_auditoria_upd;

COMMENT ON COLUMN chatbot.mensaje.procesado_en IS 'Momento en que el bot atendio (o descarto por viejo o repetido) un mensaje entrante. NULL significa pendiente de atender.';
