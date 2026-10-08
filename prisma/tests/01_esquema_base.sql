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

SELECT set_config('app.actor', 'sistema:bot', false);
INSERT INTO chatbot.usuario (wa_id, profile_name) VALUES ('wa-test-1', 'Prueba');

DO $$
DECLARE u chatbot.usuario;
BEGIN
  SELECT * INTO u FROM chatbot.usuario WHERE wa_id = 'wa-test-1';
  ASSERT u.id IS NOT NULL, 'T01 uuid generado por la base';
  ASSERT u.usuario_creacion = 'sistema:bot' AND u.usuario_modificacion = 'sistema:bot', 'T01 actor de creacion';
  ASSERT u.version_fila = 1, 'T01 version inicial';
  ASSERT u.estado_conversacion_id = 1 AND u.activo, 'T01 valores por defecto';
END $$;

SELECT pg_sleep(0.05);
SELECT set_config('app.actor', 'sistema:rec', false);
UPDATE chatbot.usuario SET profile_name = 'Otro' WHERE wa_id = 'wa-test-1';

DO $$
DECLARE u chatbot.usuario;
BEGIN
  SELECT * INTO u FROM chatbot.usuario WHERE wa_id = 'wa-test-1';
  ASSERT u.version_fila = 2, 'T02 la version sube';
  ASSERT u.usuario_creacion = 'sistema:bot', 'T02 el creador no cambia';
  ASSERT u.usuario_modificacion = 'sistema:rec', 'T02 el modificador es el actor nuevo';
  ASSERT u.fecha_modificacion > u.fecha_creacion, 'T02 la fecha de modificacion avanza';
END $$;

UPDATE chatbot.usuario SET profile_name = 'Otro' WHERE wa_id = 'wa-test-1';
DO $$
BEGIN
  ASSERT (SELECT version_fila FROM chatbot.usuario WHERE wa_id = 'wa-test-1') = 2, 'T03 un UPDATE sin cambios no sube la version';
END $$;

SELECT set_config('app.actor', '', false);
UPDATE chatbot.usuario SET profile_name = 'Otro2' WHERE wa_id = 'wa-test-1';
DO $$
BEGIN
  ASSERT (SELECT usuario_modificacion FROM chatbot.usuario WHERE wa_id = 'wa-test-1') = current_user, 'T04 sin actor declarado queda el rol de la base';
END $$;

SELECT set_config('app.actor', 'ciudadano:wa-test-1', false);
INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id)
SELECT 1, id, wa_id, false, 'Me cobraron por una atencion', 'trace-1' FROM chatbot.usuario WHERE wa_id = 'wa-test-1';

DO $$
DECLARE r chatbot.incidencia_paciente; h record;
BEGIN
  SELECT * INTO r FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-1';
  ASSERT r.usuario_creacion = 'ciudadano:wa-test-1', 'T05 creado por el ciudadano';
  ASSERT r.categoria_id IS NULL AND r.categoria_ia_id IS NULL AND r.estado_incidencia_id = 1, 'T05 nace sin categoria y REGISTRADO';
  SELECT * INTO h FROM chatbot.incidencia_paciente_auditoria WHERE incidencia_paciente_id = r.id;
  ASSERT h.operacion = 'CREACION' AND h.actor = 'ciudadano:wa-test-1' AND h.version_fila = 1, 'T05 historial de creacion';
END $$;

SELECT set_config('app.actor', 'sistema:ia', false);
UPDATE chatbot.incidencia_paciente SET categoria_ia_id = 1, categoria_confianza = 92.50 WHERE trace_id = 'trace-1';

DO $$
DECLARE r chatbot.incidencia_paciente; h record;
BEGIN
  SELECT * INTO r FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-1';
  ASSERT r.categoria_id = 1 AND r.categoria_asignada_en IS NOT NULL, 'T06 la categoria actual queda igual a la de la IA';
  ASSERT r.version_fila = 2 AND r.usuario_modificacion = 'sistema:ia', 'T06 version y actor';
  ASSERT r.area_destino_id = (SELECT id FROM catalogo.area WHERE codigo = 'OTRANS'), 'T06 una denuncia por corrupcion queda asignada a OTRANS al clasificarse';
  SELECT * INTO h FROM chatbot.incidencia_paciente_auditoria WHERE incidencia_paciente_id = r.id AND operacion = 'ACTUALIZACION';
  ASSERT h.cambios ? 'categoria_ia_id' AND h.cambios ? 'categoria_id' AND h.cambios ? 'categoria_confianza', 'T06 el historial guarda que cambio';
  ASSERT NOT (h.cambios ? 'version_fila') AND NOT (h.cambios ? 'fecha_modificacion'), 'T06 el historial no guarda ruido de auditoria';
  ASSERT (h.cambios -> 'categoria_ia_id' ->> 'antes') IS NULL AND (h.cambios -> 'categoria_ia_id' ->> 'despues') = '1', 'T06 valor anterior y nuevo';
  ASSERT h.actor = 'sistema:ia' AND h.version_fila = 2, 'T06 actor del historial';
END $$;

SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET categoria_ia_id = 2 WHERE trace_id = 'trace-1'$q$, '23514', 'T07a categoria de la IA es unica');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET categoria_confianza = 10 WHERE trace_id = 'trace-1'$q$, '23514', 'T07b confianza de la IA es unica');

SELECT set_config('app.actor', 'operador:7', false);
UPDATE chatbot.incidencia_paciente SET categoria_id = 3 WHERE trace_id = 'trace-1';

DO $$
DECLARE r chatbot.incidencia_paciente; e ia.entrenamiento_categoria;
BEGIN
  SELECT * INTO r FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-1';
  ASSERT r.categoria_id = 3 AND r.categoria_ia_id = 1, 'T08 la actual cambia y la de la IA se conserva';
  ASSERT r.categoria_corregida_en IS NOT NULL AND r.categoria_corregida_por = 'operador:7', 'T08 quien y cuando corrigio';
  SELECT * INTO e FROM ia.entrenamiento_categoria WHERE incidencia_paciente_id = r.id;
  ASSERT e.categoria_ia_id = 1 AND e.categoria_final_id = 3 AND e.fue_corregida, 'T08 la replica guarda IA y categoria final y marca que fue corregida';
  ASSERT e.texto_entrenamiento = 'Me cobraron por una atencion' AND e.categoria_confianza = 92.50, 'T08 la replica guarda el texto y la confianza';
  ASSERT e.revisado_por = 'operador:7' AND e.usuario_creacion = 'operador:7', 'T08 la replica guarda quien corrigio';
END $$;

SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET categoria_id = 2 WHERE trace_id = 'trace-1'$q$, '23514', 'T09 la correccion es unica');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET descripcion = 'cambiada' WHERE trace_id = 'trace-1'$q$, '23514', 'T10a descripcion inmutable');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET dni_reclamante = '12345678' WHERE trace_id = 'trace-1'$q$, '23514', 'T10b datos de origen inmutables');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET categoria_corregida_en = now() WHERE trace_id = 'trace-1'$q$, '23514', 'T10c columnas gestionadas por la base');

SELECT set_config('app.actor', 'operador:9', false);
UPDATE chatbot.incidencia_paciente SET resolucion = 'Se derivo al area de integridad', estado_incidencia_id = 4 WHERE trace_id = 'trace-1';
DO $$
DECLARE r chatbot.incidencia_paciente;
BEGIN
  SELECT * INTO r FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-1';
  ASSERT r.resuelto_en IS NOT NULL AND r.resuelto_por = 'operador:9', 'T11 la base llena quien y cuando resolvio';
END $$;
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET resolucion = 'otra' WHERE trace_id = 'trace-1'$q$, '23514', 'T11b la resolucion es unica');

SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET activo = false WHERE trace_id = 'trace-1'$q$, '23514', 'T12a borrado logico exige fecha y actor');
UPDATE chatbot.incidencia_paciente SET activo = false, eliminado_en = now(), eliminado_por = 'operador:9' WHERE trace_id = 'trace-1';
DO $$
BEGIN
  ASSERT (SELECT NOT activo AND eliminado_por = 'operador:9' FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-1'), 'T12b borrado logico';
END $$;
SELECT pg_temp.espera_error($q$DELETE FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-1'$q$, '23001', 'T12c el borrado fisico esta bloqueado');
SELECT pg_temp.espera_error($q$DELETE FROM chatbot.usuario WHERE wa_id = 'wa-test-1'$q$, '23001', 'T12d no se borra un usuario');

SELECT set_config('app.actor', 'sistema:bot', false);
INSERT INTO chatbot.evidencia (incidencia_paciente_id, tipo_evidencia_id, mime_type, tamano, ruta)
SELECT id, 1, 'image/jpeg', 2048, 'media/2026/10/abc.jpg' FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-1';
DO $$
BEGIN
  ASSERT (SELECT usuario_creacion FROM chatbot.evidencia LIMIT 1) = 'sistema:bot', 'T13 evidencia firmada al crearse';
  ASSERT (SELECT hash_archivo IS NULL FROM chatbot.evidencia LIMIT 1), 'T13 el hash queda para la segunda etapa';
END $$;
SELECT pg_temp.espera_error($q$UPDATE chatbot.evidencia SET ruta = 'otra'$q$, '23001', 'T14a la evidencia no se modifica');
SELECT pg_temp.espera_error($q$DELETE FROM chatbot.evidencia$q$, '23001', 'T14b la evidencia no se borra');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente_auditoria SET actor = 'x'$q$, '23001', 'T14c el historial no se modifica');
SELECT pg_temp.espera_error($q$DELETE FROM chatbot.incidencia_paciente_auditoria$q$, '23001', 'T14d el historial no se borra');
SELECT pg_temp.espera_error($q$DELETE FROM ia.entrenamiento_categoria$q$, '23001', 'T14e el entrenamiento no se borra');
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.evidencia (incidencia_paciente_id, tipo_evidencia_id, mime_type, tamano, ruta) SELECT id, 1, 'image/jpeg', 0, 'x' FROM chatbot.incidencia_paciente LIMIT 1$q$, '23514', 'T14f tamano positivo');

INSERT INTO chatbot.mensaje (usuario_id, direccion_mensaje_id, tipo_mensaje_id, contenido, wa_message_id, fecha_hora)
SELECT id, 2, 1, 'Hola', 'wamid-1', now() FROM chatbot.usuario WHERE wa_id = 'wa-test-1';
SELECT set_config('app.actor', 'externo:meta', false);
UPDATE chatbot.mensaje SET estado_mensaje_id = 3 WHERE wa_message_id = 'wamid-1';
DO $$
DECLARE m chatbot.mensaje;
BEGIN
  SELECT * INTO m FROM chatbot.mensaje WHERE wa_message_id = 'wamid-1';
  ASSERT m.version_fila = 2 AND m.usuario_modificacion = 'externo:meta' AND m.usuario_creacion = 'sistema:bot', 'T15 el estado de entrega lo firma Meta';
END $$;
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.mensaje (usuario_id, direccion_mensaje_id, tipo_mensaje_id, fecha_hora) SELECT id, 1, 999, now() FROM chatbot.usuario LIMIT 1$q$, '23503', 'T16 el catalogo exige una fila valida');
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.mensaje (usuario_id, direccion_mensaje_id, tipo_mensaje_id, fecha_hora, wa_message_id) SELECT id, 1, 1, now(), 'wamid-1' FROM chatbot.usuario LIMIT 1$q$, '23505', 'T17 wa_message_id evita duplicados');

INSERT INTO chatbot.sesion_conversacion (wa_id, estado, slots, contadores) VALUES ('wa-test-1', 'main_menu', '{}', '{}');
SELECT pg_sleep(0.05);
UPDATE chatbot.sesion_conversacion SET estado = 'cita_awaiting_dni' WHERE wa_id = 'wa-test-1';
DO $$
BEGIN
  ASSERT (SELECT fecha_modificacion > fecha_creacion FROM chatbot.sesion_conversacion WHERE wa_id = 'wa-test-1'), 'T18 la sesion actualiza su fecha';
END $$;

SELECT set_config('app.actor', 'ciudadano:wa-test-1', false);
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, dni_reclamante, descripcion, trace_id) SELECT 1, id, wa_id, true, '12345678', 'x', 'trace-2' FROM chatbot.usuario LIMIT 1$q$, '23514', 'T19 un reclamo anonimo no lleva DNI');
INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id)
SELECT 1, id, wa_id, true, 'Anonimo', 'trace-3' FROM chatbot.usuario LIMIT 1;
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET categoria_id = 2 WHERE trace_id = 'trace-3'$q$, '23514', 'T20 la primera categoria la asigna la IA');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET categoria_ia_id = 2, categoria_confianza = 150 WHERE trace_id = 'trace-3'$q$, '23514', 'T21 confianza entre 0 y 100');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET categoria_ia_id = 2, categoria_id = 1 WHERE trace_id = 'trace-3'$q$, '23514', 'T22 la primera categoria debe ser la de la IA');

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM chatbot.incidencia_paciente_auditoria;
  ASSERT n >= 4, 'T23 el historial acumula los cambios';
  SELECT count(*) INTO n FROM ia.entrenamiento_categoria;
  ASSERT n = 1, 'T24 solo se replica la correccion, no la asignacion de la IA';
END $$;

SELECT set_config('app.actor', 'sistema:ia', false);
UPDATE chatbot.incidencia_paciente SET categoria_ia_id = 2, categoria_confianza = 71.00, version_clasificador = 'clasificador-v1' WHERE trace_id = 'trace-3';
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET version_clasificador = 'otra' WHERE trace_id = 'trace-3'$q$, '23514', 'T25a la version del clasificador es inmutable');

SELECT set_config('app.actor', 'operador:9', false);
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET categoria_confirmada_por = 'x' WHERE trace_id = 'trace-3'$q$, '23514', 'T25b quien confirma lo llena la base');
UPDATE chatbot.incidencia_paciente SET categoria_confirmada_en = now() WHERE trace_id = 'trace-3';

DO $$
DECLARE r chatbot.incidencia_paciente; e ia.entrenamiento_categoria; n int;
BEGIN
  SELECT * INTO r FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-3';
  ASSERT r.categoria_id = 2 AND r.categoria_corregida_en IS NULL AND r.categoria_confirmada_por = 'operador:9', 'T26 la confirmacion deja la categoria y registra quien confirmo';
  SELECT * INTO e FROM ia.entrenamiento_categoria WHERE incidencia_paciente_id = r.id;
  ASSERT NOT e.fue_corregida AND e.categoria_final_id = 2 AND e.version_clasificador = 'clasificador-v1', 'T26 la replica marca confirmacion y guarda la version';
  ASSERT e.revisado_por = 'operador:9' AND e.categoria_confianza = 71.00, 'T26 la replica guarda quien reviso y la confianza';
  SELECT count(*) INTO n FROM ia.entrenamiento_categoria;
  ASSERT n = 2, 'T26 ahora hay una correccion y una confirmacion';
END $$;

SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET categoria_confirmada_en = now() WHERE trace_id = 'trace-3'$q$, '23514', 'T27 la confirmacion es unica');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET categoria_id = 1 WHERE trace_id = 'trace-3'$q$, '23514', 'T28 una categoria confirmada no se corrige');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET categoria_confirmada_en = NULL WHERE trace_id = 'trace-3'$q$, '23514', 'T28b la confirmacion no se quita');

SELECT set_config('app.actor', 'ciudadano:wa-test-1', false);
INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id)
SELECT 1, id, wa_id, true, 'Sin IA todavia', 'trace-4' FROM chatbot.usuario LIMIT 1;
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET categoria_confirmada_en = now() WHERE trace_id = 'trace-4'$q$, '23514', 'T29 no se confirma lo que la IA no clasifico');

TRUNCATE chatbot.archivo_recibido, chatbot.solicitud_carga, chatbot.evidencia, chatbot.incidencia_paciente_auditoria, ia.entrenamiento_categoria,
         chatbot.incidencia_analisis, chatbot.incidencia_paciente, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion;

\echo TODAS LAS PRUEBAS PASARON
