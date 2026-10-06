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

INSERT INTO chatbot.sesion_conversacion (wa_id, estado, slots, contadores)
SELECT 'purga-vieja-' || g, 'main_menu', '{}', '{}' FROM generate_series(1, 5) AS g;
INSERT INTO chatbot.sesion_conversacion (wa_id, estado, slots, contadores) VALUES
  ('purga-90min', 'main_menu', '{}', '{}'),
  ('purga-reciente-1', 'main_menu', '{}', '{}'),
  ('purga-reciente-2', 'main_menu', '{}', '{}');

ALTER TABLE chatbot.sesion_conversacion DISABLE TRIGGER trg_sesion_conversacion_b_fecha;
UPDATE chatbot.sesion_conversacion SET fecha_modificacion = now() - interval '2 hours' WHERE wa_id LIKE 'purga-vieja-%';
UPDATE chatbot.sesion_conversacion SET fecha_modificacion = now() - interval '90 minutes' WHERE wa_id = 'purga-90min';
UPDATE chatbot.sesion_conversacion SET fecha_modificacion = now() - interval '30 minutes' WHERE wa_id LIKE 'purga-reciente-%';
ALTER TABLE chatbot.sesion_conversacion ENABLE TRIGGER trg_sesion_conversacion_b_fecha;

DO $$
BEGIN
  ASSERT chatbot.purgar_sesiones_inactivas(3, 100) = 0, 'P01 con un umbral mayor a la antiguedad no borra nada';
  ASSERT (SELECT count(*) FROM chatbot.sesion_conversacion WHERE wa_id LIKE 'purga-%') = 8, 'P01 las 8 siguen';
END $$;

DO $$
BEGIN
  ASSERT chatbot.purgar_sesiones_inactivas(1, 2) = 2, 'P02 borra solo el lote pedido';
  ASSERT (SELECT count(*) FROM chatbot.sesion_conversacion WHERE wa_id LIKE 'purga-vieja-%') = 3, 'P02 quedan las demas vencidas';
END $$;

DO $$
DECLARE n integer; total integer := 0;
BEGIN
  LOOP
    n := chatbot.purgar_sesiones_inactivas(1, 2);
    EXIT WHEN n = 0;
    total := total + n;
  END LOOP;
  ASSERT total = 4, 'P03 en total se borran las 3 viejas que quedaban y la de 90 minutos';
  ASSERT (SELECT count(*) FROM chatbot.sesion_conversacion WHERE wa_id LIKE 'purga-reciente-%') = 2, 'P03 las recientes se conservan';
  ASSERT chatbot.purgar_sesiones_inactivas() = 0, 'P03 sin vencidas devuelve 0 (valores por defecto)';
END $$;

INSERT INTO chatbot.usuario (wa_id) VALUES ('purga-usuario');
DO $$
BEGIN
  PERFORM chatbot.purgar_sesiones_inactivas(1, 1000);
  ASSERT (SELECT count(*) FROM chatbot.usuario WHERE wa_id = 'purga-usuario') = 1, 'P04 los usuarios no se tocan';
END $$;

SELECT pg_temp.espera_error($q$SELECT chatbot.purgar_sesiones_inactivas(0, 10)$q$, '23514', 'P05 las horas deben ser al menos 1');
SELECT pg_temp.espera_error($q$SELECT chatbot.purgar_sesiones_inactivas(1, 0)$q$, '23514', 'P06 el lote debe ser al menos 1');
SELECT pg_temp.espera_error($q$SELECT chatbot.purgar_sesiones_inactivas(NULL, 10)$q$, '23514', 'P07 las horas no pueden ser nulas');

DELETE FROM chatbot.sesion_conversacion WHERE wa_id LIKE 'purga-%';
TRUNCATE chatbot.usuario CASCADE;

\echo TODAS LAS PRUEBAS DE PURGA PASARON
