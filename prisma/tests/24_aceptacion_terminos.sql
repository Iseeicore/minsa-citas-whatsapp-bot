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

INSERT INTO chatbot.aceptacion_terminos (wa_id, canal_origen_id, version) VALUES
  ('t24-whatsapp', 1, '2026-10-29'),
  ('t24-web', 2, '2026-10-29'),
  ('t24-whatsapp', 1, '2026-11-15');

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM chatbot.aceptacion_terminos WHERE wa_id LIKE 't24-%') = 3,
    'A01 guarda una aceptacion por canal y por version, tambien repetida para el mismo chat';
  ASSERT (SELECT bool_and(id IS NOT NULL AND aceptado_en IS NOT NULL) FROM chatbot.aceptacion_terminos WHERE wa_id LIKE 't24-%'),
    'A02 la base pone el identificador y la fecha de aceptacion';
END $$;

SELECT pg_temp.espera_error($q$INSERT INTO chatbot.aceptacion_terminos (wa_id, canal_origen_id, version) VALUES ('t24-x', 99, '2026-10-29')$q$, '23503', 'A03 un canal fuera del catalogo se rechaza');
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.aceptacion_terminos (wa_id, canal_origen_id, version) VALUES ('t24-x', 1, '  ')$q$, '23514', 'A04 una version vacia se rechaza');
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.aceptacion_terminos (wa_id, canal_origen_id, version) VALUES ('', 1, '2026-10-29')$q$, '23514', 'A05 un chat vacio se rechaza');
SELECT pg_temp.espera_error($q$UPDATE chatbot.aceptacion_terminos SET version = 'otra' WHERE wa_id = 't24-web'$q$, '23001', 'A06 una aceptacion no se modifica');
SELECT pg_temp.espera_error($q$DELETE FROM chatbot.aceptacion_terminos WHERE wa_id = 't24-web'$q$, '23001', 'A07 una aceptacion no se borra');

\echo TODAS LAS PRUEBAS DE ACEPTACION DE TERMINOS PASARON
