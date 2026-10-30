BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE chatbot.contador_codigo_incidencia ADD COLUMN serie TEXT NOT NULL DEFAULT 'N';
ALTER TABLE chatbot.contador_codigo_incidencia DROP CONSTRAINT pk_contador_codigo_incidencia;
ALTER TABLE chatbot.contador_codigo_incidencia ADD CONSTRAINT pk_contador_codigo_incidencia PRIMARY KEY (anio, serie);
ALTER TABLE chatbot.contador_codigo_incidencia ADD CONSTRAINT ck_contador_codigo_incidencia_serie CHECK ((serie = ANY (ARRAY['N'::text, 'A'::text])));

ALTER TABLE chatbot.incidencia_paciente DROP CONSTRAINT ck_incidencia_paciente_codigo;
ALTER TABLE chatbot.incidencia_paciente ADD CONSTRAINT ck_incidencia_paciente_codigo CHECK ((codigo ~ '^MINSA-[0-9]{4}-(A-)?[0-9]{6,}$'::text));
ALTER TABLE chatbot.incidencia_paciente ADD CONSTRAINT ck_incidencia_paciente_codigo_serie CHECK ((es_anonimo OR (codigo !~ '^MINSA-[0-9]{4}-A-'::text)));

ALTER TABLE gestion.usuario_interno ADD COLUMN clave_cambiada_en TIMESTAMPTZ(3);

DROP FUNCTION IF EXISTS chatbot.generar_codigo_incidencia(timestamptz);

COMMIT;
