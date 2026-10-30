\set ON_ERROR_STOP on
\set QUIET on

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
END $$;

\echo TODAS LAS PRUEBAS DE LA MIGRACION REPETIBLE DE LA SERIE ANONIMA PASARON
