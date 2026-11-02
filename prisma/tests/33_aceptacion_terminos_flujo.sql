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

INSERT INTO chatbot.aceptacion_terminos (wa_id, canal_origen_id, version) VALUES ('t33-sin-flujo', 1, '2026-10-29');
INSERT INTO chatbot.aceptacion_terminos (wa_id, canal_origen_id, version, flujo) VALUES ('t33-denuncia', 2, '2026-10-29', 'DENUNCIA');

DO $$
BEGIN
  ASSERT (SELECT flujo FROM chatbot.aceptacion_terminos WHERE wa_id = 't33-sin-flujo') = 'CITA',
    'F01 una aceptacion guardada sin servicio, como las anteriores a la columna, queda como CITA';
  ASSERT (SELECT flujo FROM chatbot.aceptacion_terminos WHERE wa_id = 't33-denuncia') = 'DENUNCIA',
    'F02 una aceptacion de la denuncia se guarda como DENUNCIA';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'chatbot' AND indexname = 'ix_aceptacion_terminos_wa_id'),
    'F03 el indice solo por chat ya no existe';
END $$;

SELECT pg_temp.espera_error($q$INSERT INTO chatbot.aceptacion_terminos (wa_id, canal_origen_id, version, flujo) VALUES ('t33-x', 1, '2026-10-29', 'OTRO')$q$, '23514', 'F04 un servicio fuera de la lista se rechaza');
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.aceptacion_terminos (wa_id, canal_origen_id, version, flujo) VALUES ('t33-x', 1, '2026-10-29', 'cita')$q$, '23514', 'F05 el servicio se escribe en mayusculas');
SELECT pg_temp.espera_error($q$UPDATE chatbot.aceptacion_terminos SET flujo = 'DENUNCIA' WHERE wa_id = 't33-sin-flujo'$q$, '23001', 'F06 el servicio no se modifica');
SELECT pg_temp.espera_error($q$UPDATE chatbot.aceptacion_terminos SET aceptado_en = now() - interval '1 day' WHERE wa_id = 't33-sin-flujo'$q$, '23001', 'F07 la fecha no se modifica');

UPDATE chatbot.aceptacion_terminos SET wa_id = 't33-denuncia-nuevo' WHERE wa_id = 't33-denuncia';

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM chatbot.aceptacion_terminos WHERE wa_id = 't33-denuncia-nuevo' AND flujo = 'DENUNCIA')
     AND NOT EXISTS (SELECT 1 FROM chatbot.aceptacion_terminos WHERE wa_id = 't33-denuncia'),
    'F08 el chat si cambia, para que la aceptacion siga a la persona cuando WhatsApp le cambia el BSUID';
END $$;

\echo TODAS LAS PRUEBAS DEL SERVICIO DE LA ACEPTACION DE TERMINOS PASARON
