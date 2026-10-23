BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE chatbot.incidencia_paciente ADD COLUMN IF NOT EXISTS derivacion_descripcion text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'chatbot.incidencia_paciente'::regclass
       AND conname = 'ck_incidencia_paciente_derivacion_descripcion'
  ) THEN
    ALTER TABLE chatbot.incidencia_paciente
      ADD CONSTRAINT ck_incidencia_paciente_derivacion_descripcion CHECK (
        derivacion_descripcion IS NULL
        OR (derivacion_descripcion = btrim(derivacion_descripcion) AND char_length(derivacion_descripcion) BETWEEN 10 AND 2000)
      );
  END IF;
END $$;

COMMENT ON COLUMN chatbot.incidencia_paciente.derivacion_descripcion IS 'Descripción de la última derivación manual, de 10 a 2000 caracteres sin espacios en los extremos. Nula en registros anteriores o sin derivación descrita; los motivos anteriores se conservan en la auditoría.';

COMMIT;
