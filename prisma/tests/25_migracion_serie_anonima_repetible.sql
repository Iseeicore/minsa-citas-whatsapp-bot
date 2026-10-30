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

SELECT set_config('app.actor', 'ciudadano:wa-serie-repetible', false);
INSERT INTO chatbot.usuario (wa_id) VALUES ('wa-serie-repetible');

INSERT INTO chatbot.contador_codigo_incidencia (anio, serie, ultimo) VALUES (1999, 'N', 41), (1999, 'A', 7);

INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id)
SELECT 1, id, 'wa-serie-repetible', t.anonimo, 'Caso previo a repetir la migracion', 'trace-serie-repetible-' || t.nombre
  FROM chatbot.usuario, (VALUES ('identificada', false), ('anonima', true)) AS t(nombre, anonimo)
 WHERE wa_id = 'wa-serie-repetible';

CREATE TEMP TABLE contador_antes AS SELECT anio, serie, ultimo FROM chatbot.contador_codigo_incidencia;
CREATE TEMP TABLE incidencia_antes AS SELECT id, codigo, es_anonimo FROM chatbot.incidencia_paciente;

\ir ../migrations/20261030120000_serie_anonima_y_cambio_de_clave/migration.sql
\ir ../migrations/20261030120000_serie_anonima_y_cambio_de_clave/migration.sql

DO $$
BEGIN
  ASSERT (
    SELECT array_agg(a.attname::text ORDER BY k.ord)
      FROM pg_constraint c
      CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.conname = 'pk_contador_codigo_incidencia'
  ) = ARRAY['anio', 'serie'],
    'M01 la clave del contador sigue siendo anio y serie despues de correr la migracion otra vez';
  ASSERT (
    SELECT count(*) FROM pg_constraint
     WHERE conname IN ('ck_contador_codigo_incidencia_serie', 'ck_incidencia_paciente_codigo', 'ck_incidencia_paciente_codigo_serie')
  ) = 3,
    'M02 cada restriccion de la serie queda una sola vez';
  ASSERT (
    SELECT count(*) FROM information_schema.columns
     WHERE (table_schema, table_name, column_name) IN (('chatbot', 'contador_codigo_incidencia', 'serie'), ('gestion', 'usuario_interno', 'clave_cambiada_en'))
  ) = 2,
    'M03 las columnas nuevas siguen ahi sin duplicarse';
  ASSERT NOT EXISTS (
    (SELECT anio, serie, ultimo FROM chatbot.contador_codigo_incidencia EXCEPT SELECT anio, serie, ultimo FROM contador_antes)
    UNION ALL
    (SELECT anio, serie, ultimo FROM contador_antes EXCEPT SELECT anio, serie, ultimo FROM chatbot.contador_codigo_incidencia)
  ),
    'M04 los contadores de cada anio y serie quedan iguales despues de repetir la migracion';
  ASSERT NOT EXISTS (
    (SELECT id, codigo, es_anonimo FROM chatbot.incidencia_paciente EXCEPT SELECT id, codigo, es_anonimo FROM incidencia_antes)
    UNION ALL
    (SELECT id, codigo, es_anonimo FROM incidencia_antes EXCEPT SELECT id, codigo, es_anonimo FROM chatbot.incidencia_paciente)
  ),
    'M05 las incidencias conservan su codigo despues de repetir la migracion';
  ASSERT (SELECT codigo ~ '^MINSA-[0-9]{4}-[0-9]{6,}$' FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-serie-repetible-identificada'),
    'M06 la incidencia identificada conserva el formato MINSA-AAAA-NNNNNN';
  ASSERT (SELECT codigo ~ '^MINSA-[0-9]{4}-A-[0-9]{6,}$' FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-serie-repetible-anonima'),
    'M07 la incidencia anonima conserva el formato MINSA-AAAA-A-NNNNNN';
END $$;

SELECT pg_temp.espera_error($q$INSERT INTO chatbot.contador_codigo_incidencia (anio, serie, ultimo) VALUES (1999, 'N', 50)$q$, '23505', 'M08 la clave anio y serie sigue rechazando un contador repetido');
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.contador_codigo_incidencia (anio, serie, ultimo) VALUES (1998, 'X', 1)$q$, '23514', 'M09 la serie sigue aceptando solo N y A');

\echo TODAS LAS PRUEBAS DE LA MIGRACION REPETIBLE DE LA SERIE ANONIMA PASARON
