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
INSERT INTO catalogo.area (codigo, nombre, tipo_area_id) VALUES ('T30-EESS', 'Establecimiento 30', 1);
INSERT INTO catalogo.establecimiento_salud (codigo_renipress, nombre, nivel_atencion_id, area_id)
SELECT '9301', nombre, 1, id FROM catalogo.area WHERE codigo = 'T30-EESS';
INSERT INTO gestion.usuario_interno (nombre_completo, correo, password_hash, area_id)
SELECT 'OTRANS 30', 'otrans30@minsa.gob.pe', '$argon2id$v=19$m=1,t=1,p=1$a$b', id FROM catalogo.area WHERE codigo = 'OTRANS';
INSERT INTO gestion.usuario_rol (usuario_interno_id, rol_id)
SELECT u.id, r.id FROM gestion.usuario_interno u, gestion.rol r WHERE u.correo = 'otrans30@minsa.gob.pe' AND r.codigo = 'OTRANS';

CREATE FUNCTION pg_temp.nuevo(p_traza text, p_categoria integer) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.actor', 'ciudadano:' || p_traza, false);
  INSERT INTO chatbot.usuario (wa_id) VALUES ('wa-' || p_traza);
  INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id, establecimiento_id)
  SELECT 1, u.id, u.wa_id, true, 'Caso ' || p_traza, p_traza, (SELECT id FROM catalogo.establecimiento_salud WHERE codigo_renipress = '9301')
    FROM chatbot.usuario u WHERE u.wa_id = 'wa-' || p_traza;
  PERFORM set_config('app.actor', 'sistema:ia', false);
  UPDATE chatbot.incidencia_paciente SET categoria_ia_id = p_categoria, categoria_confianza = 80, version_clasificador = 'v1' WHERE trace_id = p_traza;
  PERFORM set_config('app.actor', 'usuario:otrans30@minsa.gob.pe', false);
END;
$$;

CREATE FUNCTION pg_temp.devolver(p_traza text) RETURNS void
LANGUAGE sql AS $$
  UPDATE chatbot.incidencia_paciente SET categoria_id = 2, estado_incidencia_id = 6, derivacion_descripcion = 'No es corrupcion: es una queja del establecimiento'
   WHERE trace_id = p_traza;
$$;

SELECT pg_temp.nuevo('t30-confirmada', 1);
UPDATE chatbot.incidencia_paciente SET categoria_confirmada_en = now() WHERE trace_id = 't30-confirmada';
SELECT pg_temp.devolver('t30-confirmada');

DO $$
DECLARE r chatbot.incidencia_paciente;
BEGIN
  SELECT * INTO r FROM chatbot.incidencia_paciente WHERE trace_id = 't30-confirmada';
  ASSERT r.categoria_id = 2 AND r.estado_incidencia_id = 6
     AND r.area_destino_id = (SELECT id FROM catalogo.area WHERE codigo = 'T30-EESS'),
    'O01 OTRANS devuelve un caso confirmado como queja, DERIVADO a su establecimiento de origen';
  ASSERT r.derivado_por = 'usuario:otrans30@minsa.gob.pe' AND r.derivado_en IS NOT NULL, 'O02 la devolucion queda firmada como derivacion';
  ASSERT r.categoria_confirmada_por = 'usuario:otrans30@minsa.gob.pe' AND r.categoria_corregida_en IS NULL,
    'O03 la primera revision se conserva tal cual: confirmada y sin correccion';
END $$;

SELECT pg_temp.nuevo('t30-corregida', 2);
UPDATE chatbot.incidencia_paciente SET categoria_id = 1 WHERE trace_id = 't30-corregida';
SELECT pg_temp.devolver('t30-corregida');
DO $$
BEGIN
  ASSERT (SELECT categoria_id = 2 AND estado_incidencia_id = 6 AND categoria_corregida_en IS NOT NULL
            FROM chatbot.incidencia_paciente WHERE trace_id = 't30-corregida'),
    'O04 un caso ya corregido a corrupcion tambien se devuelve, sin reescribir su correccion';
END $$;

SELECT pg_temp.nuevo('t30-rechazos', 1);
UPDATE chatbot.incidencia_paciente SET categoria_confirmada_en = now() WHERE trace_id = 't30-rechazos';
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET categoria_id = 2, estado_incidencia_id = 6 WHERE trace_id = 't30-rechazos'$q$, '23514', 'O05 sin descripcion de la derivacion no hay devolucion');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET categoria_id = 2 WHERE trace_id = 't30-rechazos'$q$, '23514', 'O06 sin pasar a DERIVADO es una segunda correccion y se rechaza');
SELECT set_config('app.actor', 'usuario:gestor30@minsa.gob.pe', false);
SELECT pg_temp.espera_error($q$SELECT pg_temp.devolver('t30-rechazos')$q$, '23514', 'O07 solo devuelve un usuario OTRANS del area actual del caso');

TRUNCATE chatbot.incidencia_etiqueta, chatbot.archivo_recibido, chatbot.solicitud_carga, chatbot.evidencia, chatbot.incidencia_paciente_auditoria,
         ia.entrenamiento_categoria, chatbot.incidencia_analisis, chatbot.incidencia_paciente, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion;

\echo TODAS LAS PRUEBAS DE DEVOLUCION OTRANS PASARON
