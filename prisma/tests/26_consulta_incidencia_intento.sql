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

CREATE OR REPLACE FUNCTION pg_temp.inicio_del_dia_en_lima() RETURNS timestamptz
LANGUAGE sql AS $$
  SELECT date_trunc('day', now() AT TIME ZONE 'America/Lima'::text) AT TIME ZONE 'America/Lima'::text
$$;

INSERT INTO chatbot.consulta_incidencia_intento (identificador, canal_origen_id, resultado) VALUES
  ('t26-whatsapp', 1, 'encontrada'),
  ('t26-whatsapp', 1, 'no_encontrada'),
  ('t26-web', 2, 'error'),
  ('t26-web', 2, 'reintentos_agotados');

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM chatbot.consulta_incidencia_intento WHERE identificador LIKE 't26-%') = 4,
    'C01 guarda los cuatro resultados por los dos canales';
  ASSERT (SELECT bool_and(id IS NOT NULL AND fecha_creacion IS NOT NULL) FROM chatbot.consulta_incidencia_intento WHERE identificador LIKE 't26-%'),
    'C02 la base pone el identificador de la fila y la fecha';
END $$;

SELECT pg_temp.espera_error($q$INSERT INTO chatbot.consulta_incidencia_intento (identificador, canal_origen_id, resultado) VALUES ('t26-x', 1, 'otro')$q$, '23514', 'C03 un resultado fuera de la lista se rechaza');
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.consulta_incidencia_intento (identificador, canal_origen_id, resultado) VALUES ('t26-x', 99, 'error')$q$, '23503', 'C04 un canal fuera del catalogo se rechaza');
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.consulta_incidencia_intento (identificador, canal_origen_id, resultado) VALUES ('  ', 1, 'error')$q$, '23514', 'C05 un identificador vacio se rechaza');
SELECT pg_temp.espera_error($q$UPDATE chatbot.consulta_incidencia_intento SET resultado = 'encontrada' WHERE identificador = 't26-web'$q$, '23001', 'C06 el resultado no se modifica');
SELECT pg_temp.espera_error($q$UPDATE chatbot.consulta_incidencia_intento SET fecha_creacion = now() - interval '1 day' WHERE identificador = 't26-web'$q$, '23001', 'C07 la fecha no se modifica');
SELECT pg_temp.espera_error($q$UPDATE chatbot.consulta_incidencia_intento SET canal_origen_id = 1 WHERE identificador = 't26-web'$q$, '23001', 'C08 el canal no se modifica');
SELECT pg_temp.espera_error($q$DELETE FROM chatbot.consulta_incidencia_intento WHERE identificador = 't26-web'$q$, '23001', 'C09 una consulta no se borra');

UPDATE chatbot.consulta_incidencia_intento SET identificador = 't26-web-nuevo' WHERE identificador = 't26-web';

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM chatbot.consulta_incidencia_intento WHERE identificador = 't26-web-nuevo') = 2
     AND NOT EXISTS (SELECT 1 FROM chatbot.consulta_incidencia_intento WHERE identificador = 't26-web'),
    'C10 el identificador si cambia, para que el cupo siga a la persona cuando WhatsApp le cambia el BSUID';
END $$;

INSERT INTO chatbot.consulta_incidencia_intento (identificador, canal_origen_id, resultado, fecha_creacion) VALUES
  ('t26-dia', 1, 'encontrada', pg_temp.inicio_del_dia_en_lima() - interval '1 second'),
  ('t26-dia', 1, 'no_encontrada', pg_temp.inicio_del_dia_en_lima()),
  ('t26-dia', 1, 'error', now());

DO $$
BEGIN
  ASSERT (
    SELECT count(*)
      FROM chatbot.consulta_incidencia_intento
     WHERE identificador = 't26-dia'
       AND fecha_creacion >= date_trunc('day', now() AT TIME ZONE 'America/Lima'::text) AT TIME ZONE 'America/Lima'::text
  ) = 2,
    'C11 el dia se cuenta en hora de Lima: la consulta de las 23:59:59 de ayer en Lima no cuenta aunque en UTC ya sea hoy';
END $$;

\echo TODAS LAS PRUEBAS DE CONSULTAS DE INCIDENCIA PASARON
