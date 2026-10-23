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

SELECT set_config('app.actor', 'sistema:prueba', false);
INSERT INTO catalogo.area (codigo, nombre, tipo_area_id) VALUES
  ('T23-EESS-1', 'Establecimiento 23-1', 1),
  ('T23-EESS-2', 'Establecimiento 23-2', 1);
INSERT INTO catalogo.establecimiento_salud (codigo_renipress, nombre, nivel_atencion_id, area_id)
SELECT v.renipress, a.nombre, 1, a.id FROM (VALUES ('9231', 'T23-EESS-1'), ('9232', 'T23-EESS-2')) AS v(renipress, area) JOIN catalogo.area a ON a.codigo = v.area;

CREATE FUNCTION pg_temp.nuevo(p_traza text, p_eess text, p_categoria integer) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_usuario uuid;
BEGIN
  PERFORM set_config('app.actor', 'ciudadano:' || p_traza, false);
  INSERT INTO chatbot.usuario (wa_id) VALUES ('wa-' || p_traza) RETURNING id INTO v_usuario;
  INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id, establecimiento_id)
  VALUES (1, v_usuario, 'wa-' || p_traza, true, 'Caso ' || p_traza, p_traza,
          (SELECT id FROM catalogo.establecimiento_salud WHERE codigo_renipress = p_eess));
  IF p_categoria IS NOT NULL THEN
    PERFORM set_config('app.actor', 'sistema:ia', false);
    UPDATE chatbot.incidencia_paciente SET categoria_ia_id = p_categoria, categoria_confianza = 80, version_clasificador = 'v1' WHERE trace_id = p_traza;
  END IF;
  PERFORM set_config('app.actor', 'usuario:rev-23', false);
END;
$$;

CREATE FUNCTION pg_temp.destino(p_traza text) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(a.codigo, '-') FROM chatbot.incidencia_paciente i LEFT JOIN catalogo.area a ON a.id = i.area_destino_id WHERE i.trace_id = p_traza;
$$;

SELECT pg_temp.nuevo('t23-queja', '9231', 2);
SELECT pg_temp.nuevo('t23-corrupcion', '9231', 1);

UPDATE chatbot.incidencia_paciente SET derivacion_descripcion = NULL WHERE trace_id = 't23-queja';
DO $$
BEGIN
  ASSERT (SELECT bool_and(derivacion_descripcion IS NULL) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 't23-%'),
    'D01 la descripcion de la derivacion es opcional: nace nula y acepta nulo';
END $$;

SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET derivacion_descripcion = 'Muy corta' WHERE trace_id = 't23-queja'$q$, '23514', 'D02 menos de 10 caracteres se rechaza');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET derivacion_descripcion = repeat('a', 2001) WHERE trace_id = 't23-queja'$q$, '23514', 'D03 mas de 2000 caracteres se rechaza');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET derivacion_descripcion = ' Se deriva al otro establecimiento' WHERE trace_id = 't23-queja'$q$, '23514', 'D04 un espacio al inicio se rechaza');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET derivacion_descripcion = 'Se deriva al otro establecimiento ' WHERE trace_id = 't23-queja'$q$, '23514', 'D05 un espacio al final se rechaza');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET derivacion_descripcion = repeat(' ', 12) WHERE trace_id = 't23-queja'$q$, '23514', 'D06 solo espacios se rechaza');

UPDATE chatbot.incidencia_paciente SET derivacion_descripcion = repeat('b', 2000) WHERE trace_id = 't23-queja';
UPDATE chatbot.incidencia_paciente SET derivacion_descripcion = 'Diez letra' WHERE trace_id = 't23-queja';
DO $$
BEGIN
  ASSERT (SELECT derivacion_descripcion FROM chatbot.incidencia_paciente WHERE trace_id = 't23-queja') = 'Diez letra',
    'D07 se aceptan los extremos: 10 y 2000 caracteres';
END $$;

UPDATE chatbot.incidencia_paciente
   SET area_destino_id = (SELECT id FROM catalogo.area WHERE codigo = 'T23-EESS-2'), estado_incidencia_id = 6,
       derivacion_descripcion = 'Corresponde al otro establecimiento de la red'
 WHERE trace_id = 't23-queja';
DO $$
DECLARE r chatbot.incidencia_paciente;
BEGIN
  SELECT * INTO r FROM chatbot.incidencia_paciente WHERE trace_id = 't23-queja';
  ASSERT r.estado_incidencia_id = 6 AND pg_temp.destino('t23-queja') = 'T23-EESS-2'
     AND r.derivacion_descripcion = 'Corresponde al otro establecimiento de la red',
    'D08 la derivacion manual guarda su descripcion';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente_auditoria a
           WHERE a.incidencia_paciente_id = r.id
             AND a.actor = 'usuario:rev-23'
             AND a.cambios -> 'derivacion_descripcion' ->> 'antes' = 'Diez letra'
             AND a.cambios -> 'derivacion_descripcion' ->> 'despues' = 'Corresponde al otro establecimiento de la red') = 1,
    'D09 el historial guarda la descripcion anterior y la nueva';
END $$;

UPDATE chatbot.incidencia_paciente SET categoria_id = 2, derivacion_descripcion = 'Se corrige: es una queja del establecimiento' WHERE trace_id = 't23-corrupcion';
DO $$
DECLARE r chatbot.incidencia_paciente;
BEGIN
  SELECT * INTO r FROM chatbot.incidencia_paciente WHERE trace_id = 't23-corrupcion';
  ASSERT r.estado_incidencia_id = 2 AND r.categoria_id = 2 AND r.derivado_en IS NULL,
    'D10 corregir de corrupcion a queja con descripcion deja el caso CLASIFICADO';
  ASSERT pg_temp.destino('t23-corrupcion') = 'T23-EESS-1', 'D11 y lo devuelve al area de su establecimiento de origen';
  ASSERT r.derivacion_descripcion = 'Se corrige: es una queja del establecimiento', 'D12 la descripcion queda guardada';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente_auditoria a
           WHERE a.incidencia_paciente_id = r.id
             AND a.cambios -> 'derivacion_descripcion' ->> 'antes' IS NULL
             AND a.cambios -> 'derivacion_descripcion' ->> 'despues' = 'Se corrige: es una queja del establecimiento'
             AND a.cambios ? 'categoria_id' AND a.cambios ? 'area_destino_id') = 1,
    'D13 el historial guarda la correccion, el nuevo destino y la descripcion en el mismo cambio';
END $$;

TRUNCATE chatbot.incidencia_etiqueta, chatbot.archivo_recibido, chatbot.solicitud_carga, chatbot.evidencia, chatbot.incidencia_paciente_auditoria,
         ia.entrenamiento_categoria, chatbot.incidencia_analisis, chatbot.incidencia_paciente, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion;

\echo TODAS LAS PRUEBAS DE DESCRIPCION DE LA DERIVACION PASARON
