BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE chatbot.incidencia_paciente ADD COLUMN IF NOT EXISTS habilitado_gestores BOOLEAN NOT NULL DEFAULT false;

COMMIT;
