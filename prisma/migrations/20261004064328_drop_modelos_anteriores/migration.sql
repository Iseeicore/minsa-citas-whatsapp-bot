-- Se retiran las tablas anteriores (Conversation, Message y SandboxSession): el bot ya guarda en chatbot.usuario,
-- chatbot.mensaje y chatbot.sesion_conversacion. El esquema public deja de ser gestionado por Prisma.
DROP TABLE IF EXISTS "public"."Message";
DROP TABLE IF EXISTS "public"."Conversation";
DROP TABLE IF EXISTS "public"."SandboxSession";

DROP TYPE IF EXISTS "public"."MessageStatus";
DROP TYPE IF EXISTS "public"."MessageType";
DROP TYPE IF EXISTS "public"."MessageDirection";
DROP TYPE IF EXISTS "public"."ConversationStatus";
