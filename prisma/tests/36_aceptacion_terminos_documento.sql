\set ON_ERROR_STOP on
\set QUIET on

CREATE OR REPLACE FUNCTION pg_temp.espera_error(p_sql text, p_estado text, p_nombre text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = p_estado THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'PRUEBA % FALLO: se esperaba % pero llego % (%)', p_nombre, p_estado, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'PRUEBA % FALLO: la operacion debia fallar con %', p_nombre, p_estado;
END;
$$;

INSERT INTO chatbot.aceptacion_terminos (wa_id, canal_origen_id, version) VALUES ('t36-sin-documento', 1, '2026-10-29');
INSERT INTO chatbot.aceptacion_terminos (wa_id, canal_origen_id, version, flujo, documento) VALUES
  ('t36-ambos', 2, '2026-10-29', 'CITA', 'TERMINOS'),
  ('t36-ambos', 2, '2026-11-01', 'CITA', 'DATOS_PERSONALES');

DO $$
BEGIN
  ASSERT (SELECT documento FROM chatbot.aceptacion_terminos WHERE wa_id = 't36-sin-documento') = 'TERMINOS',
    'D01 una aceptacion guardada sin documento, como las anteriores a la columna, queda como TERMINOS';
  ASSERT (SELECT array_agg(documento || ' ' || version ORDER BY documento) FROM chatbot.aceptacion_terminos WHERE wa_id = 't36-ambos')
       = ARRAY['DATOS_PERSONALES 2026-11-01', 'TERMINOS 2026-10-29'],
    'D02 una sola aceptacion guarda una fila por documento, cada una con su version';
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'chatbot' AND indexname = 'ix_aceptacion_terminos_wa_id_flujo_documento_version')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'chatbot' AND indexname = 'ix_aceptacion_terminos_wa_id_version'),
    'D03 la busqueda por chat, servicio, documento y version tiene su indice y el indice por chat y version ya no existe';
END $$;

SELECT pg_temp.espera_error($q$INSERT INTO chatbot.aceptacion_terminos (wa_id, canal_origen_id, version, documento) VALUES ('t36-x', 1, '2026-10-29', 'OTRO')$q$, '23514', 'D04 un documento fuera de la lista se rechaza');
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.aceptacion_terminos (wa_id, canal_origen_id, version, documento) VALUES ('t36-x', 1, '2026-10-29', 'terminos')$q$, '23514', 'D05 el documento se escribe en mayusculas');
SELECT pg_temp.espera_error($q$UPDATE chatbot.aceptacion_terminos SET documento = 'DATOS_PERSONALES' WHERE wa_id = 't36-sin-documento'$q$, '23001', 'D06 el documento no se modifica');

\echo TODAS LAS PRUEBAS DEL DOCUMENTO DE LA ACEPTACION DE TERMINOS PASARON
