\set ON_ERROR_STOP on
\set QUIET on

SELECT set_config('app.actor', 'ciudadano:t29', false);
INSERT INTO chatbot.usuario (wa_id) VALUES ('wa-t29');
INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, dni_reclamante, descripcion, trace_id)
SELECT 1, id, 'wa-t29', false, '12345678', 'Caso con datos personales t29', 't29' FROM chatbot.usuario WHERE wa_id = 'wa-t29';

DO $$
DECLARE c auditoria.cambio_fila;
BEGIN
  SELECT * INTO c FROM auditoria.cambio_fila
   WHERE tabla = 'incidencia_paciente' AND operacion = 'INSERT'
     AND clave_fila ->> 'id' = (SELECT id::text FROM chatbot.incidencia_paciente WHERE trace_id = 't29');
  ASSERT c.id IS NOT NULL, 'H01 el alta que hace el bot queda en la auditoria, en la misma transaccion';
  ASSERT (SELECT actor_tipo = 'BASE_DATOS' AND actor_id = session_user FROM auditoria.evento WHERE id = c.evento_id),
    'H02 sin evento declarado se registra la conexion de la base, sin inventar un autor';
  ASSERT c.valores_nuevos ? 'codigo' AND NOT c.valores_nuevos ?| ARRAY['descripcion', 'dni_reclamante', 'wa_id', 'trace_id'],
    'H03 copia solo los campos permitidos: ni el texto ni los datos personales';
  ASSERT c.campos_modificados @> ARRAY['descripcion', 'dni_reclamante'], 'H04 pero si anota que esos campos existen en el cambio';
END $$;

BEGIN;
SELECT auditoria.registrar_evento(jsonb_build_object(
  'id', '29000000-0000-4000-8000-000000000001', 'operacion_id', '29000000-0000-4000-8000-000000000001',
  'origen', 'API', 'servicio', 'GESTION', 'modulo', 'incidencias', 'accion', 'ANULAR',
  'fase', 'EJECUCION', 'resultado', 'INICIADO', 'actor_tipo', 'USUARIO', 'actor_id', 'usuario:ana@minsa.gob.pe'));
SELECT set_config('app.auditoria', '{"evento_id": "29000000-0000-4000-8000-000000000001"}', true);
UPDATE chatbot.incidencia_paciente SET activo = false, eliminado_en = now(), eliminado_por = 'usuario:ana@minsa.gob.pe' WHERE trace_id = 't29';
COMMIT;

DO $$
DECLARE c auditoria.cambio_fila;
BEGIN
  SELECT * INTO c FROM auditoria.cambio_fila
   WHERE evento_id = '29000000-0000-4000-8000-000000000001' AND tabla = 'incidencia_paciente';
  ASSERT c.operacion = 'UPDATE' AND (c.valores_anteriores ->> 'activo')::boolean AND NOT (c.valores_nuevos ->> 'activo')::boolean,
    'H05 el cambio se cuelga del evento de la API y guarda el valor anterior y el nuevo';
  ASSERT c.campos_modificados @> ARRAY['eliminado_por'] AND NOT c.valores_nuevos ? 'eliminado_por',
    'H06 el actor que anula queda como campo modificado, no como valor';
END $$;

TRUNCATE chatbot.incidencia_etiqueta, chatbot.archivo_recibido, chatbot.solicitud_carga, chatbot.evidencia, chatbot.incidencia_paciente_auditoria,
         ia.entrenamiento_categoria, chatbot.incidencia_analisis, chatbot.incidencia_paciente, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion;

\echo TODAS LAS PRUEBAS DE AUDITORIA DE CAMBIOS PASARON
