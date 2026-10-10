-- Cola de entrada de WhatsApp sobre Postgres: marca cuando un mensaje entrante ya fue atendido.
--
-- Una persona puede partir lo que quiere decir en varios mensajes seguidos. Para responder una sola vez, cada mensaje
-- entrante nace pendiente (procesado_en NULL) y el bot lo toma con un solo UPDATE ... RETURNING cuando termina su
-- ventana de espera. Un mensaje que quede pendiente por una caida del servicio se vence al arrancar y no se responde.
--
-- Los mensajes que ya existian se dan por atendidos para que ninguno vuelva a aparecer como pendiente. Se apaga el
-- trigger de auditoria durante ese UPDATE para no tocar fecha_modificacion ni version_fila del historial.

-- AlterTable
ALTER TABLE "chatbot"."mensaje" ADD COLUMN "procesado_en" TIMESTAMPTZ(3);

ALTER TABLE chatbot.mensaje DISABLE TRIGGER trg_mensaje_b_auditoria_upd;
UPDATE chatbot.mensaje SET procesado_en = fecha_creacion WHERE procesado_en IS NULL;
ALTER TABLE chatbot.mensaje ENABLE TRIGGER trg_mensaje_b_auditoria_upd;

COMMENT ON COLUMN chatbot.mensaje.procesado_en IS 'Momento en que el bot atendio (o descarto por viejo o repetido) un mensaje entrante. NULL significa pendiente de atender.';
