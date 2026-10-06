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

SELECT set_config('app.actor', 'ciudadano:wa-codigo', false);
INSERT INTO chatbot.usuario (wa_id) VALUES ('wa-codigo');

CREATE TEMP TABLE antes AS
SELECT coalesce(max(ultimo), 0) AS n FROM chatbot.contador_codigo_incidencia
 WHERE anio = extract(year FROM now() AT TIME ZONE 'America/Lima');

INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id)
SELECT 1, id, 'wa-codigo', true, 'Caso de codigo ' || t, 'trace-codigo-' || t
  FROM chatbot.usuario, unnest(ARRAY['A', 'B']) AS t WHERE wa_id = 'wa-codigo' ORDER BY t;

DO $$
DECLARE
  v_anio text := extract(year FROM now() AT TIME ZONE 'America/Lima')::text;
  v_n integer := (SELECT n FROM antes);
BEGIN
  ASSERT (SELECT codigo FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-codigo-A') = 'MINSA-' || v_anio || '-' || lpad((v_n + 1)::text, 6, '0'),
    'C01 la primera incidencia lleva MINSA, el anio y el correlativo de 6 digitos';
  ASSERT (SELECT codigo FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-codigo-B') = 'MINSA-' || v_anio || '-' || lpad((v_n + 2)::text, 6, '0'),
    'C02 la siguiente lleva el correlativo siguiente';
  ASSERT (SELECT ultimo FROM chatbot.contador_codigo_incidencia WHERE anio = v_anio::integer) = v_n + 2,
    'C03 el contador queda en el ultimo numero entregado';
  ASSERT (SELECT count(DISTINCT codigo) = count(*) FROM chatbot.incidencia_paciente), 'C04 no hay dos incidencias con el mismo codigo';
  ASSERT (SELECT a.cambios ->> 'codigo' FROM chatbot.incidencia_paciente_auditoria a JOIN chatbot.incidencia_paciente i ON i.id = a.incidencia_paciente_id
           WHERE i.trace_id = 'trace-codigo-A' AND a.operacion = 'CREACION') = (SELECT codigo FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-codigo-A'),
    'C05 el historial de creacion ya trae el codigo';
END $$;

INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id, codigo)
SELECT 1, id, 'wa-codigo', true, 'Caso con codigo falso', 'trace-codigo-falso', 'MINSA-1999-000001' FROM chatbot.usuario WHERE wa_id = 'wa-codigo';

DO $$
DECLARE
  v_anio text := extract(year FROM now() AT TIME ZONE 'America/Lima')::text;
  v_n integer := (SELECT n FROM antes);
BEGIN
  ASSERT (SELECT codigo FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-codigo-falso') = 'MINSA-' || v_anio || '-' || lpad((v_n + 3)::text, 6, '0'),
    'C06 el codigo que envia quien inserta se descarta';
END $$;

SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET codigo = 'MINSA-2026-999999' WHERE trace_id = 'trace-codigo-A'$q$, '23514', 'C07 el codigo no se cambia');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET codigo = '' WHERE trace_id = 'trace-codigo-A'$q$, '23514', 'C08 el codigo no se vacia');

SELECT pg_temp.espera_error($q$DO $d$ BEGIN
  ALTER TABLE chatbot.incidencia_paciente DISABLE TRIGGER USER;
  UPDATE chatbot.incidencia_paciente SET codigo = 'MINSA-26-1' WHERE trace_id = 'trace-codigo-A';
END $d$$q$, '23514', 'C09 el formato del codigo lo exige la tabla');
SELECT pg_temp.espera_error($q$DO $d$ BEGIN
  ALTER TABLE chatbot.incidencia_paciente DISABLE TRIGGER USER;
  UPDATE chatbot.incidencia_paciente SET codigo = (SELECT codigo FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-codigo-B') WHERE trace_id = 'trace-codigo-A';
END $d$$q$, '23505', 'C10 el codigo es unico');

DO $$
BEGIN
  ASSERT chatbot.generar_codigo_incidencia('2031-06-01 12:00:00-05') = 'MINSA-2031-000001', 'C11 el primer codigo de un anio es el 000001';
  ASSERT chatbot.generar_codigo_incidencia('2031-06-02 12:00:00-05') = 'MINSA-2031-000002', 'C12 el correlativo avanza de uno en uno';
  ASSERT chatbot.generar_codigo_incidencia('2032-06-01 12:00:00-05') = 'MINSA-2032-000001', 'C13 al cambiar el anio el correlativo reinicia';
  ASSERT chatbot.generar_codigo_incidencia('2031-12-31 23:59:59-05') = 'MINSA-2031-000003', 'C14 el ultimo segundo del anio en Lima sigue siendo de ese anio';
  ASSERT chatbot.generar_codigo_incidencia('2032-01-01 00:00:00-05') = 'MINSA-2032-000002', 'C15 el primer segundo del anio siguiente en Lima ya es del anio nuevo';
  ASSERT chatbot.generar_codigo_incidencia('2032-01-01 04:59:59+00') = 'MINSA-2031-000004', 'C16 el 1 de enero en UTC todavia es 31 de diciembre en Lima';
  ASSERT chatbot.generar_codigo_incidencia('2032-01-01 05:00:00+00') = 'MINSA-2032-000003', 'C17 desde las 05:00 UTC ya es el anio nuevo en Lima';
END $$;

SELECT pg_temp.espera_error($q$SELECT chatbot.generar_codigo_incidencia(NULL)$q$, '23514', 'C18 la fecha es obligatoria');

BEGIN;
SELECT chatbot.generar_codigo_incidencia('2033-05-05 10:00:00-05');
ROLLBACK;

DO $$
BEGIN
  ASSERT chatbot.generar_codigo_incidencia('2033-05-05 10:00:00-05') = 'MINSA-2033-000001', 'C19 un numero de una transaccion revertida no se gasta';
END $$;

INSERT INTO chatbot.contador_codigo_incidencia (anio, ultimo) VALUES (2034, 999999);

DO $$
BEGIN
  ASSERT chatbot.generar_codigo_incidencia('2034-02-02 10:00:00-05') = 'MINSA-2034-1000000', 'C20 pasado el 999999 el correlativo sigue creciendo sin cortarse';
  ASSERT 'MINSA-2034-1000000' ~ '^MINSA-[0-9]{4}-[0-9]{6,}$', 'C21 el formato admite mas de 6 digitos';
END $$;

SELECT pg_temp.espera_error($q$UPDATE chatbot.contador_codigo_incidencia SET ultimo = 0 WHERE anio = 2031$q$, '23514', 'C22 el contador no retrocede');
SELECT pg_temp.espera_error($q$UPDATE chatbot.contador_codigo_incidencia SET anio = 2999 WHERE anio = 2031$q$, '23514', 'C23 el contador no cambia de anio');
SELECT pg_temp.espera_error($q$DELETE FROM chatbot.contador_codigo_incidencia WHERE anio = 2031$q$, '23001', 'C24 el contador no se borra');
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.contador_codigo_incidencia (anio, ultimo) VALUES (99, 0)$q$, '23514', 'C25 el anio tiene cuatro digitos');
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.contador_codigo_incidencia (anio, ultimo) VALUES (2040, -1)$q$, '23514', 'C26 el ultimo no es negativo');

BEGIN;
SELECT set_config('app.actor', 'ciudadano:wa-relleno', true);
INSERT INTO chatbot.usuario (wa_id) VALUES ('wa-relleno');
INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id)
SELECT 1, id, 'wa-relleno', true, 'Caso anterior ' || t, 'trace-relleno-' || t
  FROM chatbot.usuario, unnest(ARRAY['X', 'Y', 'Z']) AS t WHERE wa_id = 'wa-relleno';

ALTER TABLE chatbot.incidencia_paciente DISABLE TRIGGER USER;
ALTER TABLE chatbot.incidencia_paciente DROP CONSTRAINT ck_incidencia_paciente_codigo;
DROP INDEX chatbot.uq_incidencia_paciente_codigo;
UPDATE chatbot.incidencia_paciente
   SET codigo = '',
       fecha_creacion = CASE trace_id
                          WHEN 'trace-relleno-X' THEN timestamptz '2037-01-10 10:00:00-05'
                          WHEN 'trace-relleno-Y' THEN timestamptz '2037-01-05 10:00:00-05'
                          ELSE timestamptz '2037-01-20 10:00:00-05'
                        END
 WHERE trace_id LIKE 'trace-relleno-%';
ALTER TABLE chatbot.incidencia_paciente ENABLE TRIGGER USER;

DO $$
DECLARE v_rellenadas integer;
BEGIN
  v_rellenadas := chatbot.rellenar_codigos_incidencia();
  ASSERT v_rellenadas = 3, 'C27 el relleno cubre las tres filas sin codigo';
  ASSERT (SELECT string_agg(trace_id || '=' || codigo, ',' ORDER BY codigo) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'trace-relleno-%')
         = 'trace-relleno-Y=MINSA-2037-000001,trace-relleno-X=MINSA-2037-000002,trace-relleno-Z=MINSA-2037-000003',
    'C28 el relleno sigue el orden de llegada (fecha_creacion), no el de insercion';
  ASSERT (SELECT bool_and(usuario_modificacion = 'sistema:migracion' AND version_fila = 2) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'trace-relleno-%'),
    'C29 el relleno se firma como sistema:migracion';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente_auditoria a JOIN chatbot.incidencia_paciente i ON i.id = a.incidencia_paciente_id
           WHERE i.trace_id LIKE 'trace-relleno-%' AND a.operacion = 'ACTUALIZACION' AND a.actor = 'sistema:migracion'
             AND a.cambios -> 'codigo' ->> 'antes' = '' AND a.cambios -> 'codigo' ->> 'despues' LIKE 'MINSA-2037-%') = 3,
    'C30 el historial guarda el relleno de cada fila';
  ASSERT chatbot.rellenar_codigos_incidencia() = 0, 'C31 el relleno no repite filas que ya tienen codigo';
END $$;
ROLLBACK;

CREATE EXTENSION IF NOT EXISTS dblink;
SELECT dblink_connect('c_a', format('dbname=%s user=%s', current_database(), current_user));
SELECT dblink_connect('c_b', format('dbname=%s user=%s', current_database(), current_user));
SELECT dblink_exec('c_a', 'BEGIN');
CREATE TEMP TABLE concurrencia (codigo_a text, codigo_b text);
INSERT INTO concurrencia (codigo_a)
SELECT c FROM dblink('c_a', $q$SELECT chatbot.generar_codigo_incidencia(now())$q$) AS t(c text);

SELECT dblink_send_query('c_b', $q$WITH u AS (INSERT INTO chatbot.usuario (wa_id) VALUES ('wa-concurrencia') RETURNING id)
  INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id)
  SELECT 1, id, 'wa-concurrencia', true, 'Caso concurrente', 'trace-concurrencia' FROM u RETURNING codigo$q$);
SELECT pg_sleep(1);

DO $$
BEGIN
  ASSERT dblink_is_busy('c_b') = 1, 'C32 la segunda insercion queda esperando mientras la primera no termina';
  ASSERT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%trace-concurrencia%'),
    'C33 la espera es por el bloqueo de la fila del contador';
END $$;

SELECT dblink_exec('c_a', 'COMMIT');
UPDATE concurrencia SET codigo_b = (SELECT c FROM dblink_get_result('c_b') AS t(c text));

DO $$
DECLARE
  a text := (SELECT codigo_a FROM concurrencia);
  b text := (SELECT codigo_b FROM concurrencia);
BEGIN
  ASSERT a IS NOT NULL AND b IS NOT NULL AND a <> b, 'C34 dos transacciones simultaneas no repiten el codigo';
  ASSERT split_part(b, '-', 3)::integer = split_part(a, '-', 3)::integer + 1, 'C35 la segunda toma el numero siguiente, sin huecos';
  ASSERT (SELECT codigo FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-concurrencia') = b, 'C36 la incidencia guardada lleva el codigo de la segunda';
END $$;

SELECT dblink_disconnect('c_a');
SELECT dblink_disconnect('c_b');
DROP EXTENSION dblink;

\echo TODAS LAS PRUEBAS DE CODIGO DE INCIDENCIA PASARON
