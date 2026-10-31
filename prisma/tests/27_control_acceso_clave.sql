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

INSERT INTO gestion.control_acceso_clave (clave, ventana_desde) VALUES (repeat('a', 64), now());
UPDATE gestion.control_acceso_clave SET fallos = 5, bloqueado_hasta = now() + interval '15 minutes' WHERE clave = repeat('a', 64);

DO $$
BEGIN
  ASSERT (SELECT fallos = 5 AND bloqueado_hasta > ventana_desde FROM gestion.control_acceso_clave WHERE clave = repeat('a', 64)),
    'A01 una cuenta acumula fallos y queda bloqueada hasta una fecha';
END $$;

SELECT pg_temp.espera_error($q$INSERT INTO gestion.control_acceso_clave (clave, ventana_desde) VALUES ('ana@minsa.gob.pe', now())$q$, '23514', 'A02 la clave es una huella SHA256, nunca el correo');
SELECT pg_temp.espera_error($q$INSERT INTO gestion.control_acceso_clave (clave, ventana_desde, fallos) VALUES (repeat('b', 64), now(), -1)$q$, '23514', 'A03 los fallos no son negativos');
SELECT pg_temp.espera_error($q$INSERT INTO gestion.control_acceso_clave (clave, ventana_desde, bloqueado_hasta) VALUES (repeat('c', 64), now(), now() + interval '1 minute')$q$, '23514', 'A04 no hay bloqueo sin fallos');
SELECT pg_temp.espera_error($q$INSERT INTO gestion.control_acceso_clave (clave, ventana_desde, fallos, bloqueado_hasta) VALUES (repeat('d', 64), now(), 1, now() - interval '1 minute')$q$, '23514', 'A05 el bloqueo no termina antes de que empiece la ventana');

DELETE FROM gestion.control_acceso_clave;

\echo TODAS LAS PRUEBAS DEL CONTROL DE ACCESO PASARON
