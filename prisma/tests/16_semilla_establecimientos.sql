\set ON_ERROR_STOP on
\set QUIET on

-- Prueba el cargador del padron (el mismo que usa `npm run db:seed:eess`) con un puñado de filas: ceros a la izquierda,
-- espacios, campos vacios, idempotencia y actualizacion de lo que cambio.
CREATE TEMP TABLE eess_fuente (codigo_renipress text, nombre text, nivel text, categoria text, diris text, departamento text, provincia text, distrito text);
INSERT INTO eess_fuente VALUES
  ('00016206', ' HOSPITAL SEMILLA UNO ', 'III', NULL, 'DIRIS Lima Centro', NULL, NULL, NULL),
  ('16207', 'CENTRO DE SALUD SEMILLA DOS', 'I', 'I-3', 'DIRIS Lima Sur', 'Lima', 'Lima', 'Chorrillos'),
  ('16208', 'PUESTO DE SALUD SEMILLA TRES', 'I', '', 'DIRIS Lima Norte', '', NULL, NULL),
  ('16209', 'CENTRO MATERNO SEMILLA CUATRO', 'II', 'II-1', 'DIRIS Lima Este', 'Lima', 'Lima', 'Ate');

CREATE FUNCTION pg_temp.huella() RETURNS text
LANGUAGE sql AS $$
  SELECT (SELECT string_agg(codigo_renipress || ':' || version_fila || ':' || fecha_modificacion::text, ',' ORDER BY codigo_renipress) FROM catalogo.establecimiento_salud)
      || '|' || (SELECT string_agg(codigo || ':' || version_fila || ':' || fecha_modificacion::text, ',' ORDER BY codigo) FROM catalogo.area)
$$;

\ir ../seeds/eess/cargar_establecimientos.sql

DO $$
DECLARE e catalogo.establecimiento_salud; a catalogo.area;
BEGIN
  SELECT * INTO e FROM catalogo.establecimiento_salud WHERE codigo_renipress = '16206';
  ASSERT e.id IS NOT NULL, 'L01 el codigo 00016206 se guarda sin ceros (16206)';
  ASSERT NOT EXISTS (SELECT 1 FROM catalogo.establecimiento_salud WHERE codigo_renipress LIKE '0%'), 'L01 ningun codigo queda con ceros a la izquierda';
  ASSERT e.nombre = 'HOSPITAL SEMILLA UNO' AND e.nivel_atencion_id = 3 AND e.usuario_creacion = 'sistema:seed-eess', 'L02 recorta espacios, mapea el nivel y firma como sistema:seed-eess';
  SELECT * INTO a FROM catalogo.area WHERE id = e.area_id;
  ASSERT a.codigo = 'EESS-16206' AND a.nombre = 'HOSPITAL SEMILLA UNO' AND a.tipo_area_id = 1, 'L03 cada establecimiento tiene su area EESS-<renipress> de tipo ESTABLECIMIENTO';
  ASSERT (SELECT codigo FROM catalogo.area WHERE id = a.padre_id) = 'DIRIS-LC', 'L04 el area depende de su DIRIS (Lima Centro = DIRIS-LC)';
  ASSERT (SELECT string_agg(a2.codigo || '=' || a2.nombre, ',' ORDER BY a2.codigo) FROM catalogo.area a2 WHERE a2.tipo_area_id = 3 AND a2.codigo LIKE 'DIRIS-L_')
         = 'DIRIS-LC=DIRIS Lima Centro,DIRIS-LE=DIRIS Lima Este,DIRIS-LN=DIRIS Lima Norte,DIRIS-LS=DIRIS Lima Sur', 'L05 se crean las cuatro DIRIS de Lima';
  ASSERT (SELECT categoria IS NULL AND departamento IS NULL AND provincia IS NULL AND distrito IS NULL FROM catalogo.establecimiento_salud WHERE codigo_renipress = '16208'),
    'L06 las cadenas vacias quedan como nulo';
  ASSERT (SELECT n.codigo || '/' || es.categoria || '/' || es.distrito FROM catalogo.establecimiento_salud es JOIN catalogo.nivel_atencion n ON n.id = es.nivel_atencion_id
           WHERE es.codigo_renipress = '16209') = 'II/II-1/Ate', 'L07 el nivel II y la ubicacion se guardan';
  ASSERT (SELECT count(*) FROM catalogo.establecimiento_salud WHERE codigo_renipress LIKE '162%') = 4, 'L08 cuatro establecimientos';
  ASSERT (SELECT count(*) FROM catalogo.area WHERE codigo LIKE 'EESS-162%') = 4, 'L08 y cuatro areas de establecimiento';
END $$;

CREATE TEMP TABLE huella_1 AS SELECT pg_temp.huella() AS h;
SELECT pg_sleep(0.05);
\ir ../seeds/eess/cargar_establecimientos.sql
DO $$
BEGIN
  ASSERT pg_temp.huella() = (SELECT h FROM huella_1), 'L09 cargar dos veces lo mismo no cambia nada (ni versiones ni fechas)';
END $$;

-- Si algo cambio en la fuente, solo esa fila se actualiza
UPDATE eess_fuente SET nombre = 'CENTRO DE SALUD SEMILLA DOS RENOMBRADO', categoria = 'I-4' WHERE codigo_renipress = '16207';
\ir ../seeds/eess/cargar_establecimientos.sql
DO $$
BEGIN
  ASSERT (SELECT nombre || '/' || categoria || '/' || version_fila FROM catalogo.establecimiento_salud WHERE codigo_renipress = '16207') = 'CENTRO DE SALUD SEMILLA DOS RENOMBRADO/I-4/2',
    'L10 un cambio en la fuente actualiza el establecimiento y sube su version';
  ASSERT (SELECT nombre || '/' || version_fila FROM catalogo.area WHERE codigo = 'EESS-16207') = 'CENTRO DE SALUD SEMILLA DOS RENOMBRADO/2', 'L10 y el nombre de su area';
  ASSERT (SELECT bool_and(version_fila = 1) FROM catalogo.establecimiento_salud WHERE codigo_renipress IN ('16206', '16208', '16209')), 'L11 las filas que no cambiaron no se tocan';
  ASSERT (SELECT count(*) FROM catalogo.establecimiento_salud WHERE codigo_renipress LIKE '162%') = 4, 'L12 no se duplica nada';
END $$;

-- Si la fuente trae el codigo con ceros y el establecimiento ya existe sin ellos, es el mismo
UPDATE eess_fuente SET codigo_renipress = '0016207' WHERE codigo_renipress = '16207';
\ir ../seeds/eess/cargar_establecimientos.sql
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM catalogo.establecimiento_salud WHERE codigo_renipress LIKE '162%') = 4, 'L13 el mismo codigo con ceros no crea un establecimiento nuevo';
END $$;

\echo TODAS LAS PRUEBAS DE LA SEMILLA DE ESTABLECIMIENTOS PASARON
