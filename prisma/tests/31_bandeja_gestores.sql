\set ON_ERROR_STOP on
\set QUIET on

SELECT set_config('app.actor', 'sistema:prueba', false);
INSERT INTO catalogo.area (codigo, nombre, tipo_area_id) VALUES ('T31-EESS-1', 'Establecimiento 31-1', 1), ('T31-EESS-2', 'Establecimiento 31-2', 1);
INSERT INTO catalogo.establecimiento_salud (codigo_renipress, nombre, nivel_atencion_id, area_id)
SELECT '9311', nombre, 1, id FROM catalogo.area WHERE codigo = 'T31-EESS-1';

CREATE FUNCTION pg_temp.nuevo(p_traza text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.actor', 'ciudadano:' || p_traza, false);
  INSERT INTO chatbot.usuario (wa_id) VALUES ('wa-' || p_traza);
  INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id, establecimiento_id, habilitado_gestores)
  SELECT 1, u.id, u.wa_id, true, 'Caso ' || p_traza, p_traza, (SELECT id FROM catalogo.establecimiento_salud WHERE codigo_renipress = '9311'), true
    FROM chatbot.usuario u WHERE u.wa_id = 'wa-' || p_traza;
  PERFORM set_config('app.actor', 'sistema:ia', false);
  UPDATE chatbot.incidencia_paciente SET categoria_ia_id = 2, categoria_confianza = 80, version_clasificador = 'v1' WHERE trace_id = p_traza;
  PERFORM set_config('app.actor', 'usuario:responsable31@minsa.gob.pe', false);
END;
$$;

SELECT pg_temp.nuevo('t31-delegado');
DO $$
BEGIN
  ASSERT NOT (SELECT habilitado_gestores FROM chatbot.incidencia_paciente WHERE trace_id = 't31-delegado'),
    'B01 un caso nace sin habilitar para los gestores aunque el alta diga lo contrario';
END $$;

UPDATE chatbot.incidencia_paciente SET habilitado_gestores = true WHERE trace_id = 't31-delegado';
DO $$
DECLARE r chatbot.incidencia_paciente;
BEGIN
  SELECT * INTO r FROM chatbot.incidencia_paciente WHERE trace_id = 't31-delegado';
  ASSERT r.habilitado_gestores AND r.estado_incidencia_id = 2 AND r.derivado_por = 'usuario:responsable31@minsa.gob.pe' AND r.derivado_en IS NOT NULL,
    'B02 habilitarlo firma la fecha y el actor de la derivacion sin cambiar el estado';
END $$;

SELECT set_config('app.actor', 'usuario:gestor31@minsa.gob.pe', false);
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3 WHERE trace_id = 't31-delegado';
DO $$
BEGIN
  ASSERT (SELECT habilitado_gestores AND tomado_por = 'usuario:gestor31@minsa.gob.pe' FROM chatbot.incidencia_paciente WHERE trace_id = 't31-delegado'),
    'B03 tomar el caso conserva la habilitacion';
END $$;

SELECT pg_temp.nuevo('t31-reasignado');
UPDATE chatbot.incidencia_paciente SET habilitado_gestores = true WHERE trace_id = 't31-reasignado';
UPDATE chatbot.incidencia_paciente SET area_destino_id = (SELECT id FROM catalogo.area WHERE codigo = 'T31-EESS-2'), estado_incidencia_id = 6 WHERE trace_id = 't31-reasignado';
SELECT pg_temp.nuevo('t31-recategorizado');
UPDATE chatbot.incidencia_paciente SET habilitado_gestores = true WHERE trace_id = 't31-recategorizado';
UPDATE chatbot.incidencia_paciente SET categoria_id = 3 WHERE trace_id = 't31-recategorizado';
DO $$
BEGIN
  ASSERT (SELECT bool_and(NOT habilitado_gestores) FROM chatbot.incidencia_paciente WHERE trace_id IN ('t31-reasignado', 't31-recategorizado')),
    'B04 cambiar el area o la categoria quita la habilitacion';
  ASSERT (SELECT count(*) FROM auditoria.cambio_fila c JOIN chatbot.incidencia_paciente i ON c.clave_fila ->> 'id' = i.id::text
           WHERE i.trace_id = 't31-delegado' AND c.valores_nuevos ->> 'habilitado_gestores' = 'true') = 1,
    'B05 la auditoria guarda la habilitacion con su valor anterior y nuevo';
END $$;

TRUNCATE chatbot.incidencia_etiqueta, chatbot.archivo_recibido, chatbot.solicitud_carga, chatbot.evidencia, chatbot.incidencia_paciente_auditoria,
         ia.entrenamiento_categoria, chatbot.incidencia_analisis, chatbot.incidencia_paciente, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion;

\echo TODAS LAS PRUEBAS DE LA BANDEJA DE GESTORES PASARON
