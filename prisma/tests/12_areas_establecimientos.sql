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

-- Catalogos y area OTRANS
DO $$
BEGIN
  ASSERT (SELECT string_agg(codigo, ',' ORDER BY id) FROM catalogo.tipo_area WHERE recibe_sensibles) = 'OTRANS', 'A01 solo el tipo OTRANS recibe casos sensibles';
  ASSERT (SELECT count(*) FROM catalogo.tipo_area WHERE activo) = 5 AND (SELECT count(*) FROM catalogo.nivel_atencion WHERE activo) = 3
         AND (SELECT count(*) FROM catalogo.motivo_archivo WHERE activo) = 4, 'A01 los tres catalogos nuevos nacen activos y completos';
  ASSERT (SELECT usuario_creacion FROM catalogo.motivo_archivo WHERE codigo = 'DATOS_INSUFICIENTES') = 'sistema:migracion', 'A01 la migracion firma los catalogos';
  ASSERT (SELECT a.id || ':' || a.nombre || ':' || ta.codigo || ':' || coalesce(a.padre_id::text, '-') || ':' || a.activo
            FROM catalogo.area a JOIN catalogo.tipo_area ta ON ta.id = a.tipo_area_id WHERE a.codigo = 'OTRANS') = '1:OTRANS:OTRANS:-:true',
    'A02 la migracion siembra el area OTRANS, activa y sin padre';
  ASSERT (SELECT count(*) FROM catalogo.area a JOIN catalogo.tipo_area ta ON ta.id = a.tipo_area_id WHERE ta.recibe_sensibles AND a.activo) = 1,
    'A02 hay una sola area que recibe casos sensibles';
END $$;

SELECT set_config('app.actor', 'sistema:prueba', false);

SELECT pg_temp.espera_error($q$UPDATE catalogo.area SET padre_id = id WHERE codigo = 'OTRANS'$q$, '23514', 'A03 un area no es su propio padre');
SELECT pg_temp.espera_error($q$INSERT INTO catalogo.area (codigo, nombre, tipo_area_id) VALUES ('OTRANS', 'Repetida', 1)$q$, '23505', 'A04 el codigo del area es unico');
SELECT pg_temp.espera_error($q$INSERT INTO catalogo.area (codigo, nombre, tipo_area_id) VALUES ('T12-SIN-TIPO', 'Sin tipo', 99)$q$, '23503', 'A05 el tipo de area debe existir');
SELECT pg_temp.espera_error($q$INSERT INTO catalogo.area (codigo, nombre, tipo_area_id, padre_id) VALUES ('T12-SIN-PADRE', 'Sin padre', 1, 99999)$q$, '23503', 'A06 el padre debe existir');

-- Establecimientos y codigo RENIPRESS canonico
INSERT INTO catalogo.area (codigo, nombre, tipo_area_id) VALUES
  ('T12-DIRIS', 'DIRIS de prueba 12', 3),
  ('T12-EESS-1', 'Hospital Hipólito Unanue', 1),
  ('T12-EESS-2', 'Centro de Salud Ñaña', 1),
  ('T12-EESS-3', 'CENTRO DE SALUD EL AGUSTINO', 1);
UPDATE catalogo.area SET padre_id = (SELECT id FROM catalogo.area WHERE codigo = 'T12-DIRIS') WHERE codigo LIKE 'T12-EESS-%';

-- La prueba de la semilla de desarrollo (08) deja sus tres establecimientos de ejemplo: se quitan para probar desde cero.
DELETE FROM catalogo.establecimiento_salud WHERE codigo_renipress IN ('6206', '5946', '5614');

INSERT INTO catalogo.establecimiento_salud (codigo_renipress, nombre, nivel_atencion_id, categoria, distrito, area_id)
SELECT v.renipress, a.nombre, v.nivel, v.categoria, v.distrito, a.id
  FROM (VALUES ('T12-EESS-1', '6206', 3, 'III-E', 'Cercado de Lima'),
               ('T12-EESS-2', '5614', 1, 'I-3', 'Lurigancho'),
               ('T12-EESS-3', '12345678', 1, 'I-4', 'El Agustino')) AS v(area, renipress, nivel, categoria, distrito)
  JOIN catalogo.area a ON a.codigo = v.area;

DO $$
DECLARE e catalogo.establecimiento_salud;
BEGIN
  SELECT * INTO e FROM catalogo.establecimiento_salud WHERE codigo_renipress = '6206';
  ASSERT e.id IS NOT NULL AND e.activo AND e.version_fila = 1 AND e.usuario_creacion = 'sistema:prueba', 'E01 el establecimiento 6206 se guarda sin ceros y la base lo firma';
  ASSERT e.categoria = 'III-E' AND e.nivel_atencion_id = 3, 'E01 nivel y categoria oficial';
  ASSERT (SELECT padre_id IS NOT NULL FROM catalogo.area WHERE id = e.area_id), 'E01 el area del establecimiento depende de su DIRIS';
END $$;

SELECT pg_temp.espera_error($q$INSERT INTO catalogo.establecimiento_salud (codigo_renipress, nombre, area_id) SELECT '00006206', 'Con ceros', id FROM catalogo.area WHERE codigo = 'OTRANS'$q$, '23514', 'E02 el codigo RENIPRESS con ceros a la izquierda se rechaza');
SELECT pg_temp.espera_error($q$INSERT INTO catalogo.establecimiento_salud (codigo_renipress, nombre, area_id) SELECT '0', 'Cero', id FROM catalogo.area WHERE codigo = 'OTRANS'$q$, '23514', 'E02b el cero no es un codigo');
SELECT pg_temp.espera_error($q$INSERT INTO catalogo.establecimiento_salud (codigo_renipress, nombre, area_id) SELECT '123456789', 'Nueve digitos', id FROM catalogo.area WHERE codigo = 'OTRANS'$q$, '23514', 'E02c el codigo tiene a lo mas ocho digitos');
SELECT pg_temp.espera_error($q$INSERT INTO catalogo.establecimiento_salud (codigo_renipress, nombre, area_id) SELECT '62A6', 'Con letra', id FROM catalogo.area WHERE codigo = 'OTRANS'$q$, '23514', 'E02d el codigo es solo digitos');
SELECT pg_temp.espera_error($q$INSERT INTO catalogo.establecimiento_salud (codigo_renipress, nombre, area_id) SELECT ' 6206', 'Con espacio', id FROM catalogo.area WHERE codigo = 'OTRANS'$q$, '23514', 'E02e el codigo no lleva espacios');
SELECT pg_temp.espera_error($q$INSERT INTO catalogo.establecimiento_salud (codigo_renipress, nombre, area_id) SELECT '6206', 'Repetido', id FROM catalogo.area WHERE codigo = 'OTRANS'$q$, '23505', 'E03 el codigo RENIPRESS es unico');
SELECT pg_temp.espera_error($q$INSERT INTO catalogo.establecimiento_salud (codigo_renipress, nombre, area_id) SELECT '777', 'Misma area', area_id FROM catalogo.establecimiento_salud WHERE codigo_renipress = '6206'$q$, '23505', 'E04 cada area sirve a un solo establecimiento');
SELECT pg_temp.espera_error($q$UPDATE catalogo.establecimiento_salud SET codigo_renipress = '006206' WHERE codigo_renipress = '6206'$q$, '23514', 'E05 el codigo no se cambia a una forma con ceros');
SELECT pg_temp.espera_error($q$INSERT INTO catalogo.establecimiento_salud (codigo_renipress, nombre, nivel_atencion_id, area_id) SELECT '778', 'Nivel invalido', 9, id FROM catalogo.area WHERE codigo = 'OTRANS'$q$, '23503', 'E06 el nivel debe existir');
SELECT pg_temp.espera_error($q$INSERT INTO catalogo.establecimiento_salud (codigo_renipress, nombre, area_id) VALUES ('779', 'Sin area', 99999)$q$, '23503', 'E07 el area debe existir');
SELECT pg_temp.espera_error($q$INSERT INTO catalogo.establecimiento_salud (codigo_renipress, nombre, nombre_busqueda, area_id) SELECT '780', 'Escribe la columna generada', 'x', id FROM catalogo.area WHERE codigo = 'OTRANS'$q$, '428C9', 'E08 el nombre de busqueda lo calcula la base');

UPDATE catalogo.establecimiento_salud SET nombre = 'Hospital Hipólito Unanue' WHERE codigo_renipress = '6206';
DO $$
BEGIN
  ASSERT (SELECT version_fila FROM catalogo.establecimiento_salud WHERE codigo_renipress = '6206') = 1, 'E09 un UPDATE sin cambios no sube la version';
END $$;
SELECT pg_sleep(0.05);
UPDATE catalogo.establecimiento_salud SET nombre = 'Hospital Nacional Hipólito Unanue' WHERE codigo_renipress = '6206';
DO $$
BEGIN
  ASSERT (SELECT version_fila FROM catalogo.establecimiento_salud WHERE codigo_renipress = '6206') = 2, 'E09 un cambio real sube la version';
  ASSERT (SELECT nombre_busqueda FROM catalogo.establecimiento_salud WHERE codigo_renipress = '6206') = 'hospital nacional hipolito unanue',
    'E10 el nombre de busqueda se recalcula sin tildes y en minuscula';
END $$;

-- Busqueda por similitud sin tildes ni mayusculas
DO $$
BEGIN
  ASSERT (SELECT string_agg(codigo_renipress, ',') FROM catalogo.establecimiento_salud WHERE public.f_unaccent('HIPOLITO UNANUE') <% nombre_busqueda) = '6206',
    'B01 "HIPOLITO UNANUE" encuentra el Hospital Hipólito Unanue (sin tildes y en mayusculas)';
  ASSERT (SELECT string_agg(codigo_renipress, ',') FROM catalogo.establecimiento_salud WHERE public.f_unaccent('Hipólito Unane') <% nombre_busqueda) = '6206',
    'B02 tolera una letra mal escrita';
  ASSERT (SELECT string_agg(codigo_renipress, ',') FROM catalogo.establecimiento_salud WHERE nombre_busqueda LIKE '%' || public.f_unaccent('Ñaña') || '%') = '5614',
    'B03 la ñ se busca como n';
  ASSERT (SELECT string_agg(codigo_renipress, ',') FROM catalogo.establecimiento_salud WHERE public.f_unaccent('agustino') <% nombre_busqueda) = '12345678',
    'B04 una sola palabra del nombre alcanza';
  ASSERT public.f_unaccent('ÁÉÍÓÚ Ñ') = 'aeiou n', 'B05 f_unaccent quita tildes y baja a minuscula';
END $$;

SET enable_seqscan = off;
DO $$
DECLARE linea text; usa_indice boolean := false;
BEGIN
  FOR linea IN EXECUTE $q$EXPLAIN SELECT id FROM catalogo.establecimiento_salud WHERE 'unanue' <% nombre_busqueda$q$ LOOP
    IF linea LIKE '%ix_establecimiento_salud_nombre_busqueda%' THEN
      usa_indice := true;
    END IF;
  END LOOP;
  ASSERT usa_indice, 'B06 la busqueda por similitud usa el indice de trigramas';
END $$;
RESET enable_seqscan;

-- Origen de la incidencia
INSERT INTO chatbot.usuario (wa_id) VALUES ('wa-t12');
UPDATE catalogo.establecimiento_salud SET activo = false WHERE codigo_renipress = '12345678';
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id, establecimiento_id)
  SELECT 1, u.id, u.wa_id, true, 'Origen desactivado', 't12-desactivado', e.id FROM chatbot.usuario u, catalogo.establecimiento_salud e
   WHERE u.wa_id = 'wa-t12' AND e.codigo_renipress = '12345678'$q$, '23514', 'O01 no se reporta contra un establecimiento desactivado');
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id, establecimiento_id)
  SELECT 1, u.id, u.wa_id, true, 'Origen inexistente', 't12-inexistente', 99999 FROM chatbot.usuario u WHERE u.wa_id = 'wa-t12'$q$, '23514', 'O02 el establecimiento de origen debe existir');
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id, area_destino_id)
  SELECT 1, u.id, u.wa_id, true, 'Con destino', 't12-destino', a.id FROM chatbot.usuario u, catalogo.area a WHERE u.wa_id = 'wa-t12' AND a.codigo = 'OTRANS'$q$, '23514', 'O03 el destino no se asigna al crear');
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id, derivado_en, derivado_por)
  SELECT 1, u.id, u.wa_id, true, 'Con marcas', 't12-marcas', now(), 'x' FROM chatbot.usuario u WHERE u.wa_id = 'wa-t12'$q$, '23514', 'O04 las marcas de derivacion no se envian al crear');

SELECT set_config('app.actor', 'ciudadano:wa-t12', false);
INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id, establecimiento_id)
SELECT 1, u.id, u.wa_id, true, 'Con origen', 't12-origen', e.id FROM chatbot.usuario u, catalogo.establecimiento_salud e WHERE u.wa_id = 'wa-t12' AND e.codigo_renipress = '6206';
INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id)
SELECT 1, u.id, u.wa_id, true, 'Sin origen', 't12-sin-origen' FROM chatbot.usuario u WHERE u.wa_id = 'wa-t12';

SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET establecimiento_id = (SELECT id FROM catalogo.establecimiento_salud WHERE codigo_renipress = '5614') WHERE trace_id = 't12-origen'$q$, '23514', 'O05 el establecimiento de origen no cambia');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET establecimiento_id = (SELECT id FROM catalogo.establecimiento_salud WHERE codigo_renipress = '5614') WHERE trace_id = 't12-sin-origen'$q$, '23514', 'O06 quien no es la migracion no completa el origen vacio');
SELECT pg_temp.espera_error($q$DELETE FROM catalogo.establecimiento_salud WHERE codigo_renipress = '6206'$q$, '23001', 'O07 un establecimiento con incidencias no se borra');

SELECT set_config('app.actor', 'sistema:migracion', false);
UPDATE chatbot.incidencia_paciente SET establecimiento_id = (SELECT id FROM catalogo.establecimiento_salud WHERE codigo_renipress = '5614') WHERE trace_id = 't12-sin-origen';
DO $$
BEGIN
  ASSERT (SELECT e.codigo_renipress FROM chatbot.incidencia_paciente i JOIN catalogo.establecimiento_salud e ON e.id = i.establecimiento_id WHERE i.trace_id = 't12-sin-origen') = '5614',
    'O08 solo la carga de datos de la migracion completa un origen vacio';
END $$;

TRUNCATE chatbot.archivo_recibido, chatbot.solicitud_carga, chatbot.evidencia, chatbot.incidencia_paciente_auditoria,
         ia.entrenamiento_categoria, chatbot.incidencia_analisis, chatbot.incidencia_paciente, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion;

\echo TODAS LAS PRUEBAS DE AREAS Y ESTABLECIMIENTOS PASARON
