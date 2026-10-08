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
  ('T19-EESS-1', 'Establecimiento 19-1', 1),
  ('T19-EESS-2', 'Establecimiento 19-2', 1);
INSERT INTO catalogo.establecimiento_salud (codigo_renipress, nombre, nivel_atencion_id, area_id)
SELECT v.renipress, a.nombre, 1, a.id FROM (VALUES ('9191', 'T19-EESS-1'), ('9192', 'T19-EESS-2')) AS v(renipress, area) JOIN catalogo.area a ON a.codigo = v.area;

-- p_eess NULL: caso sin establecimiento de origen. p_categoria NULL: sin clasificar.
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
  PERFORM set_config('app.actor', 'usuario:rev-19', false);
END;
$$;

CREATE FUNCTION pg_temp.destino(p_traza text) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(a.codigo, '-') FROM chatbot.incidencia_paciente i LEFT JOIN catalogo.area a ON a.id = i.area_destino_id WHERE i.trace_id = p_traza;
$$;

-- ===== Al clasificarse, el caso no sensible queda en el area de su establecimiento =====
SELECT pg_temp.nuevo('t19-queja', '9191', 2);
SELECT pg_temp.nuevo('t19-reclamo', '9192', 3);
SELECT pg_temp.nuevo('t19-otro', '9191', 4);
SELECT pg_temp.nuevo('t19-corrupcion', '9191', 1);
SELECT pg_temp.nuevo('t19-sinorigen', NULL, 2);
SELECT pg_temp.nuevo('t19-registrado', '9191', NULL);
DO $$
BEGIN
  ASSERT pg_temp.destino('t19-queja') = 'T19-EESS-1', 'N01 una queja clasificada queda en el area de su establecimiento';
  ASSERT pg_temp.destino('t19-reclamo') = 'T19-EESS-2', 'N02 un reclamo, en el area del suyo';
  ASSERT pg_temp.destino('t19-otro') = 'T19-EESS-1', 'N03 la categoria otro tambien';
  ASSERT pg_temp.destino('t19-corrupcion') = 'OTRANS', 'N04 la corrupcion sigue yendo a OTRANS';
  ASSERT pg_temp.destino('t19-sinorigen') = '-', 'N05 sin establecimiento de origen no hay destino que asignar';
  ASSERT pg_temp.destino('t19-registrado') = '-', 'N06 un caso aun sin clasificar no tiene destino';
  ASSERT (SELECT bool_and(estado_incidencia_id = 2 AND derivado_en IS NULL AND derivado_por IS NULL AND tomado_en IS NULL)
            FROM chatbot.incidencia_paciente WHERE trace_id IN ('t19-queja', 't19-reclamo', 't19-otro')),
    'N07 asignar el destino no deriva ni toma: el caso sigue CLASIFICADO';
END $$;

-- ===== Tomar directo desde CLASIFICADO, para cualquier destino =====
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3 WHERE trace_id = 't19-queja';
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3 WHERE trace_id = 't19-sinorigen'$q$, '23514', 'N09 tomar sin destino falla');
DO $$
DECLARE r chatbot.incidencia_paciente;
BEGIN
  SELECT * INTO r FROM chatbot.incidencia_paciente WHERE trace_id = 't19-queja';
  ASSERT r.estado_incidencia_id = 3 AND r.tomado_por = 'usuario:rev-19' AND r.tomado_en IS NOT NULL AND r.derivado_en IS NULL,
    'N08 el encargado toma el caso directo desde CLASIFICADO, sin derivar';
END $$;
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3 WHERE trace_id = 't19-corrupcion';
DO $$
BEGIN
  ASSERT (SELECT estado_incidencia_id FROM chatbot.incidencia_paciente WHERE trace_id = 't19-corrupcion') = 3, 'N10 la corrupcion tambien se toma directo';
END $$;

-- Resolver desde ahi
UPDATE chatbot.incidencia_paciente SET medidas_tomadas = 'Se atendio la queja', fundamento = 'La queja era procedente', resultado_resolucion_id = 1 WHERE trace_id = 't19-queja';
DO $$
BEGIN
  ASSERT (SELECT estado_incidencia_id FROM chatbot.incidencia_paciente WHERE trace_id = 't19-queja') = 4, 'N11 el flujo cierra: clasificado, en gestion, resuelto';
END $$;

-- ===== Derivar sigue permitido desde CLASIFICADO, a otra area =====
UPDATE chatbot.incidencia_paciente SET area_destino_id = (SELECT id FROM catalogo.area WHERE codigo = 'T19-EESS-2'), estado_incidencia_id = 6 WHERE trace_id = 't19-otro';
DO $$
DECLARE r chatbot.incidencia_paciente;
BEGIN
  SELECT * INTO r FROM chatbot.incidencia_paciente WHERE trace_id = 't19-otro';
  ASSERT r.estado_incidencia_id = 6 AND pg_temp.destino('t19-otro') = 'T19-EESS-2' AND r.derivado_por = 'usuario:rev-19', 'N12 derivar a otra area desde CLASIFICADO sigue funcionando';
END $$;

-- ===== Correcciones de categoria =====
-- no sensible a no sensible: el destino no cambia
SELECT pg_temp.nuevo('t19-q-r', '9191', 2);
UPDATE chatbot.incidencia_paciente SET categoria_id = 3 WHERE trace_id = 't19-q-r';
-- no sensible a sensible: pasa a OTRANS
SELECT pg_temp.nuevo('t19-q-c', '9191', 2);
UPDATE chatbot.incidencia_paciente SET categoria_id = 1 WHERE trace_id = 't19-q-c';
-- sensible a no sensible: vuelve al establecimiento de origen
SELECT pg_temp.nuevo('t19-c-q', '9192', 1);
UPDATE chatbot.incidencia_paciente SET categoria_id = 2 WHERE trace_id = 't19-c-q';
-- sensible a no sensible sin establecimiento de origen: se queda donde esta
SELECT pg_temp.nuevo('t19-c-q-sin', NULL, 1);
UPDATE chatbot.incidencia_paciente SET categoria_id = 2 WHERE trace_id = 't19-c-q-sin';
-- sensible a no sensible con el caso ya en gestion: no se mueve
SELECT pg_temp.nuevo('t19-c-q-gestion', '9192', 1);
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3 WHERE trace_id = 't19-c-q-gestion';
UPDATE chatbot.incidencia_paciente SET categoria_id = 2 WHERE trace_id = 't19-c-q-gestion';
DO $$
BEGIN
  ASSERT pg_temp.destino('t19-q-r') = 'T19-EESS-1', 'N13 corregir de queja a reclamo no mueve el destino';
  ASSERT pg_temp.destino('t19-q-c') = 'OTRANS', 'N14 corregir a corrupcion lo manda a OTRANS';
  ASSERT pg_temp.destino('t19-c-q') = 'T19-EESS-2', 'N15 corregir de corrupcion a queja lo devuelve a su establecimiento';
  ASSERT pg_temp.destino('t19-c-q-sin') = 'OTRANS', 'N16 sin establecimiento de origen no se inventa un destino';
  ASSERT pg_temp.destino('t19-c-q-gestion') = 'OTRANS', 'N17 un caso ya en gestion no cambia de area al corregir su categoria';
  ASSERT (SELECT bool_and(categoria_corregida_por = 'usuario:rev-19') FROM chatbot.incidencia_paciente WHERE trace_id IN ('t19-q-r', 't19-q-c', 't19-c-q')),
    'N18 la correccion sigue firmada por quien la hizo';
END $$;

-- El destino puesto por la base cuenta para derivar y para el CHECK de sensibles
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET area_destino_id = (SELECT id FROM catalogo.area WHERE codigo = 'T19-EESS-1') WHERE trace_id = 't19-q-c'$q$, '23514', 'N19 un caso de corrupcion no se reasigna a un establecimiento');

TRUNCATE chatbot.archivo_recibido, chatbot.solicitud_carga, chatbot.evidencia, chatbot.incidencia_paciente_auditoria,
         ia.entrenamiento_categoria, chatbot.incidencia_analisis, chatbot.incidencia_paciente, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion;

\echo TODAS LAS PRUEBAS DE DESTINO AL CLASIFICAR PASARON
