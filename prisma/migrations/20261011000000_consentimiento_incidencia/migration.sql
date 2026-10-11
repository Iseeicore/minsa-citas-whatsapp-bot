ALTER TABLE "chatbot"."usuario" ADD COLUMN "consentimiento_aceptado_en" TIMESTAMPTZ(3);

COMMENT ON COLUMN chatbot.usuario.consentimiento_aceptado_en IS 'Momento en que la persona autorizo el tratamiento de datos para reportar una incidencia. NULL significa que nunca lo acepto (o lo rechazo): se le vuelve a preguntar.';
