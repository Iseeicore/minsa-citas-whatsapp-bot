\set ON_ERROR_STOP on
\set QUIET on

CREATE TEMP TABLE activos_antes AS SELECT id FROM catalogo.establecimiento_salud WHERE activo;

CREATE TEMP TABLE eess_fuente (codigo_renipress text, nombre text, nivel text, categoria text, autoridad_sanitaria text, departamento text, provincia text, distrito text, estado text);
INSERT INTO eess_fuente VALUES
  ('37001', 'CENTRO DE SALUD PADRON UNO', 'I', 'I-3', 'DIRIS LIMA SUR', 'Lima', 'Lima', 'Chorrillos', 'activo'),
  ('37002', 'PUESTO DE SALUD PADRON DOS', 'I', 'I-2', 'DIRESA Cusco', 'Cusco', 'Cusco', 'Wanchaq', ''),
  ('37003', 'HOSPITAL PADRON TRES', 'II', 'II-2', 'GERESA Arequipa', 'Arequipa', 'Arequipa', 'Cayma', ' Inactivo '),
  ('37004', 'CENTRO DE SALUD PADRON CUATRO', 'I', 'I-3', 'diresa cusco', NULL, NULL, NULL, NULL),
  ('37005', 'PUESTO DE SALUD PADRON CINCO', 'I', 'I-1', 'GERESA Arequipa', NULL, NULL, NULL, 'ACTIVO');

CREATE FUNCTION pg_temp.huella() RETURNS text
LANGUAGE sql AS $$
  SELECT (SELECT string_agg(codigo_renipress || ':' || activo || ':' || version_fila, ',' ORDER BY codigo_renipress) FROM catalogo.establecimiento_salud)
      || '|' || (SELECT string_agg(codigo || ':' || version_fila, ',' ORDER BY codigo) FROM catalogo.area)
$$;

\ir ../seeds/eess/establecimientos.sql

DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM catalogo.establecimiento_salud es JOIN activos_antes a ON a.id = es.id WHERE NOT es.activo),
    'P01 sin el modo de padron completo no se desactiva ningun establecimiento que falte';
END $$;

CREATE TEMP TABLE eess_modo (padron_completo boolean NOT NULL);
INSERT INTO eess_modo VALUES (true);
DELETE FROM eess_fuente WHERE codigo_renipress = '37005';
CREATE TEMP TABLE total_antes AS SELECT count(*) AS n FROM catalogo.establecimiento_salud;

\ir ../seeds/eess/establecimientos.sql

DO $$
BEGIN
  ASSERT (SELECT string_agg(codigo_renipress || ':' || activo, ',' ORDER BY codigo_renipress) FROM catalogo.establecimiento_salud WHERE codigo_renipress LIKE '3700_')
         = '37001:true,37002:true,37003:false,37004:true,37005:false', 'P02 la fila INACTIVO y la que falta en el archivo quedan inactivas';
  ASSERT NOT EXISTS (SELECT 1 FROM catalogo.establecimiento_salud WHERE activo AND codigo_renipress NOT LIKE '3700_'),
    'P03 el padron completo desactiva todo lo que no trae';
  ASSERT (SELECT count(*) FROM catalogo.establecimiento_salud) = (SELECT n FROM total_antes), 'P04 nunca borra establecimientos';
  ASSERT (SELECT ta.codigo FROM catalogo.area a JOIN catalogo.tipo_area ta ON ta.id = a.tipo_area_id WHERE a.codigo = 'AUT-DIRESA-CUSCO') = 'DIRESA',
    'P05 una autoridad fuera de Lima crea su area de tipo DIRESA con codigo AUT-<normalizado>';
  ASSERT (SELECT string_agg(hija.codigo, ',' ORDER BY hija.codigo) FROM catalogo.area hija JOIN catalogo.area padre ON padre.id = hija.padre_id WHERE padre.codigo = 'AUT-DIRESA-CUSCO')
         = 'EESS-37002,EESS-37004', 'P06 la misma autoridad escrita distinto es una sola area y es padre de sus establecimientos';
  ASSERT (SELECT padre.codigo FROM catalogo.area hija JOIN catalogo.area padre ON padre.id = hija.padre_id WHERE hija.codigo = 'EESS-37001') = 'DIRIS-LS',
    'P07 una DIRIS de Lima conserva su codigo aunque venga en mayusculas';
  ASSERT EXISTS (SELECT 1 FROM catalogo.area WHERE codigo = 'AUT-GERESA-AREQUIPA'), 'P08 cada autoridad regional tiene su area';
END $$;

CREATE TEMP TABLE huella_1 AS SELECT pg_temp.huella() AS h;
\ir ../seeds/eess/establecimientos.sql
DO $$
BEGIN
  ASSERT pg_temp.huella() = (SELECT h FROM huella_1), 'P09 repetir la misma carga no cambia nada (ni activo ni version_fila)';
END $$;

UPDATE catalogo.establecimiento_salud es SET activo = true FROM activos_antes a WHERE a.id = es.id AND NOT es.activo;

\echo TODAS LAS PRUEBAS DE LA CARGA DEL PADRON COMPLETO PASARON
