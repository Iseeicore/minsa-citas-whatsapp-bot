\set ON_ERROR_STOP on
\set QUIET on

DO $$
DECLARE
  disparador record;
BEGIN
  SELECT t.tgtype, t.tgenabled, t.tgisinternal,
         t.tgfoid = to_regprocedure('chatbot.fn_notificar_cambio_incidencia()') AS funcion_correcta,
         obj_description(t.tgfoid, 'pg_proc') AS descripcion
    INTO disparador
    FROM pg_trigger t
   WHERE t.tgrelid = 'chatbot.incidencia_paciente'::regclass
     AND t.tgname = 'trg_incidencia_paciente_notificar_cambio';
  ASSERT FOUND, 'N01 existe el disparador de notificaciones de incidencias';
  ASSERT disparador.tgtype = 29 AND NOT disparador.tgisinternal, 'N02 corre por fila, despues de INSERT, UPDATE y DELETE';
  ASSERT disparador.tgenabled IN ('O', 'A'), 'N03 el disparador esta habilitado';
  ASSERT disparador.funcion_correcta, 'N04 el disparador llama a chatbot.fn_notificar_cambio_incidencia';
  ASSERT position('minsa-incidencias:eventos-v3' IN disparador.descripcion) > 0, 'N05 la funcion declara la version de eventos que busca la API de gestion';
END $$;

SELECT set_config('app.actor', 'sistema:prueba', false);
INSERT INTO catalogo.area (codigo, nombre, tipo_area_id) VALUES ('T35-EESS', 'Establecimiento 35', 1);
INSERT INTO catalogo.establecimiento_salud (codigo_renipress, nombre, nivel_atencion_id, area_id)
SELECT '9351', nombre, 1, id FROM catalogo.area WHERE codigo = 'T35-EESS';
INSERT INTO chatbot.usuario (wa_id) VALUES ('wa-t35');

CREATE EXTENSION IF NOT EXISTS dblink;
SELECT dblink_connect('escucha', format('dbname=%s user=%s', current_database(), current_user));
SELECT dblink_exec('escucha', 'LISTEN minsa_incidencias_cambio');
CREATE TEMP TABLE aviso (paso text NOT NULL, carga jsonb NOT NULL);

CREATE FUNCTION pg_temp.recoger(p_paso text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_sleep(0.3);
  INSERT INTO aviso (paso, carga)
  SELECT p_paso, extra::jsonb FROM dblink_get_notify('escucha') WHERE notify_name = 'minsa_incidencias_cambio';
END;
$$;

SELECT set_config('app.actor', 'ciudadano:t35', false);
INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id, establecimiento_id)
SELECT 1, u.id, u.wa_id, true, 'Caso de notificaciones t35', 't35', (SELECT id FROM catalogo.establecimiento_salud WHERE codigo_renipress = '9351')
  FROM chatbot.usuario u WHERE u.wa_id = 'wa-t35';
SELECT pg_temp.recoger('alta');

SELECT set_config('app.actor', 'sistema:ia', false);
UPDATE chatbot.incidencia_paciente SET categoria_ia_id = 2, categoria_confianza = 80, version_clasificador = 'v1' WHERE trace_id = 't35';
SELECT pg_temp.recoger('clasificacion');

SELECT set_config('app.actor', 'usuario:responsable35@minsa.gob.pe', false);
BEGIN;
UPDATE chatbot.incidencia_paciente SET categoria_id = 3 WHERE trace_id = 't35';
ROLLBACK;
SELECT pg_temp.recoger('rollback');

UPDATE chatbot.incidencia_paciente SET usuario_modificacion = 'tecnico:t35' WHERE trace_id = 't35';
SELECT pg_temp.recoger('auditoria');

BEGIN;
UPDATE chatbot.incidencia_paciente SET categoria_id = 3 WHERE trace_id = 't35';
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM dblink_get_notify('escucha')) = 0, 'N06 dentro de la transaccion todavia no se avisa';
END $$;
COMMIT;
SELECT pg_temp.recoger('recategorizacion');

DO $$
DECLARE
  v_alta jsonb;
BEGIN
  ASSERT (SELECT count(*) FROM aviso WHERE paso = 'alta') = 1, 'N07 el alta de una incidencia avisa una vez';
  SELECT a.carga INTO v_alta FROM aviso a WHERE a.paso = 'alta';
  ASSERT v_alta ? 'areaAntes' AND v_alta -> 'areaAntes' = 'null'::jsonb AND v_alta -> 'categoriaAntes' = 'null'::jsonb,
    'N08 en el alta no hay area ni categoria anteriores';
  ASSERT (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_alta) k) = ARRAY['areaAntes', 'areaDespues', 'categoriaAntes', 'categoriaDespues'],
    'N09 el aviso lleva solo el area y la categoria, nunca datos del ciudadano';

  ASSERT (SELECT count(*) FROM aviso WHERE paso = 'clasificacion' AND (carga ->> 'categoriaDespues')::integer = 2) = 1,
    'N10 la clasificacion de la IA avisa con la categoria nueva';
  ASSERT NOT EXISTS (SELECT 1 FROM aviso WHERE paso = 'rollback'), 'N11 un cambio deshecho con rollback no avisa';
  ASSERT NOT EXISTS (SELECT 1 FROM aviso WHERE paso = 'auditoria'), 'N12 un cambio que solo renueva los campos de auditoria no avisa';
  ASSERT (SELECT count(*) FROM aviso WHERE paso = 'recategorizacion'
           AND (carga ->> 'categoriaAntes')::integer = 2 AND (carga ->> 'categoriaDespues')::integer = 3) = 1,
    'N13 el cambio de categoria confirmado avisa una vez, con la categoria anterior y la nueva';
END $$;

SELECT dblink_disconnect('escucha');

TRUNCATE chatbot.incidencia_etiqueta, chatbot.archivo_recibido, chatbot.solicitud_carga, chatbot.evidencia, chatbot.incidencia_paciente_auditoria,
         ia.entrenamiento_categoria, chatbot.incidencia_analisis, chatbot.incidencia_paciente, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion;

\echo TODAS LAS PRUEBAS DE LAS NOTIFICACIONES DE INCIDENCIAS PASARON
