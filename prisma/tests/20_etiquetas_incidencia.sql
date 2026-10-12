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

CREATE OR REPLACE FUNCTION pg_temp.espera_regla(p_sql text, p_mensaje text, p_nombre text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '23514' AND SQLERRM = p_mensaje THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'PRUEBA % FALLO: se esperaba 23514 (%) pero llego % (%)', p_nombre, p_mensaje, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'PRUEBA % FALLO: la operacion debia fallar con 23514 (%)', p_nombre, p_mensaje;
END;
$$;

CREATE FUNCTION pg_temp.etiqueta(p_nombre text) RETURNS integer
LANGUAGE sql AS $$
  SELECT id FROM catalogo.etiqueta WHERE nombre = p_nombre;
$$;

CREATE FUNCTION pg_temp.incidencia(p_trace text) RETURNS uuid
LANGUAGE sql AS $$
  SELECT id FROM chatbot.incidencia_paciente WHERE trace_id = p_trace;
$$;

CREATE FUNCTION pg_temp.asignar(p_trace text, p_nombre text) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO chatbot.incidencia_etiqueta (incidencia_paciente_id, etiqueta_id)
  VALUES (pg_temp.incidencia(p_trace), pg_temp.etiqueta(p_nombre));
$$;

CREATE FUNCTION pg_temp.quitar(p_trace text, p_nombre text) RETURNS void
LANGUAGE sql AS $$
  UPDATE chatbot.incidencia_etiqueta SET activo = false
   WHERE incidencia_paciente_id = pg_temp.incidencia(p_trace) AND etiqueta_id = pg_temp.etiqueta(p_nombre) AND activo;
$$;

CREATE FUNCTION pg_temp.vigentes(p_trace text) RETURNS bigint
LANGUAGE sql AS $$
  SELECT count(*) FROM chatbot.incidencia_etiqueta WHERE incidencia_paciente_id = pg_temp.incidencia(p_trace) AND activo;
$$;

SELECT set_config('app.actor', 'usuario:admin-20', false);
INSERT INTO catalogo.etiqueta (nombre, descripcion, tono) VALUES ('Urgente', 'Requiere atencion el mismo dia', 'danger');

DO $$
DECLARE e catalogo.etiqueta;
BEGIN
  SELECT * INTO e FROM catalogo.etiqueta WHERE nombre = 'Urgente';
  ASSERT e.id IS NOT NULL AND e.activo, 'Q01 la etiqueta nace activa y con id generado por la base';
  ASSERT e.usuario_creacion = 'usuario:admin-20' AND e.usuario_modificacion = 'usuario:admin-20' AND e.version_fila = 1, 'Q01 actor y version de creacion';
  ASSERT (SELECT count(*) FROM catalogo.etiqueta) = 1, 'Q01 la migracion no trae etiquetas iniciales';
END $$;

SELECT pg_temp.espera_error($q$INSERT INTO catalogo.etiqueta (nombre, tono) VALUES (' Con espacio', 'neutral')$q$, '23514', 'Q02a el nombre no lleva espacios al inicio');
SELECT pg_temp.espera_error($q$INSERT INTO catalogo.etiqueta (nombre, tono) VALUES ('Con espacio ', 'neutral')$q$, '23514', 'Q02b el nombre no lleva espacios al final');
SELECT pg_temp.espera_error($q$INSERT INTO catalogo.etiqueta (nombre, tono) VALUES ('A', 'neutral')$q$, '23514', 'Q02c el nombre tiene 2 caracteres o mas');
SELECT pg_temp.espera_error(format($q$INSERT INTO catalogo.etiqueta (nombre, tono) VALUES (%L, 'neutral')$q$, repeat('x', 41)), '23514', 'Q02d el nombre tiene 40 caracteres o menos');
SELECT pg_temp.espera_error($q$INSERT INTO catalogo.etiqueta (tono) VALUES ('neutral')$q$, '23502', 'Q02e el nombre es obligatorio');
INSERT INTO catalogo.etiqueta (nombre, tono) VALUES ('AB', 'neutral'), (repeat('y', 40), 'neutral');

SELECT pg_temp.espera_error($q$INSERT INTO catalogo.etiqueta (nombre, tono) VALUES ('URGENTE', 'neutral')$q$, '23505', 'Q03a el nombre es unico sin distinguir mayusculas');
SELECT pg_temp.espera_error($q$UPDATE catalogo.etiqueta SET nombre = 'urgente' WHERE nombre = 'AB'$q$, '23505', 'Q03b renombrar tampoco puede repetir un nombre');

SELECT pg_temp.espera_error(format($q$INSERT INTO catalogo.etiqueta (nombre, descripcion, tono) VALUES ('Larga', %L, 'neutral')$q$, repeat('d', 201)), '23514', 'Q04 la descripcion tiene 200 caracteres o menos');
INSERT INTO catalogo.etiqueta (nombre, descripcion, tono) VALUES ('Justa', repeat('d', 200), 'neutral');

SELECT pg_temp.espera_error($q$INSERT INTO catalogo.etiqueta (nombre, tono) VALUES ('Sin tono valido', 'azul')$q$, '23514', 'Q05a el tono es uno de los cinco permitidos');
SELECT pg_temp.espera_error($q$INSERT INTO catalogo.etiqueta (nombre, tono) VALUES ('Tono en mayuscula', 'Danger')$q$, '23514', 'Q05b el tono va en minuscula');
SELECT pg_temp.espera_error($q$INSERT INTO catalogo.etiqueta (nombre) VALUES ('Sin tono')$q$, '23502', 'Q05c el tono es obligatorio');
INSERT INTO catalogo.etiqueta (nombre, tono) VALUES
  ('Tono neutral', 'neutral'), ('Tono primary', 'primary'), ('Tono success', 'success'), ('Tono warning', 'warning'), ('Tono danger', 'danger');

SELECT set_config('app.actor', 'usuario:admin-21', false);
UPDATE catalogo.etiqueta SET nombre = 'Muy urgente', descripcion = NULL, tono = 'warning' WHERE nombre = 'Urgente';
UPDATE catalogo.etiqueta SET activo = false WHERE nombre = 'Muy urgente';
DO $$
DECLARE e catalogo.etiqueta;
BEGIN
  SELECT * INTO e FROM catalogo.etiqueta WHERE nombre = 'Muy urgente';
  ASSERT e.tono = 'warning' AND e.descripcion IS NULL AND NOT e.activo, 'Q06 una etiqueta se renombra, cambia de descripcion y tono y se retira';
  ASSERT e.version_fila = 3 AND e.usuario_modificacion = 'usuario:admin-21' AND e.usuario_creacion = 'usuario:admin-20', 'Q06 la auditoria registra quien la modifico';
END $$;

SELECT pg_temp.espera_error($q$INSERT INTO catalogo.etiqueta (nombre, tono) VALUES ('muy URGENTE', 'neutral')$q$, '23505', 'Q07 el nombre de una etiqueta retirada tampoco se repite');
UPDATE catalogo.etiqueta SET activo = true, nombre = 'Urgente', tono = 'danger' WHERE nombre = 'Muy urgente';
DO $$
BEGIN
  ASSERT (SELECT activo FROM catalogo.etiqueta WHERE nombre = 'Urgente'), 'Q08 una etiqueta retirada se reactiva';
END $$;

SELECT pg_temp.espera_error($q$DELETE FROM catalogo.etiqueta WHERE nombre = 'AB'$q$, '23001', 'Q09 una etiqueta no se borra fisicamente');

SELECT set_config('app.actor', 'sistema:bot', false);
INSERT INTO chatbot.usuario (wa_id, profile_name) VALUES ('wa-t20', 'Prueba 20');
INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id)
SELECT 1, u.id, u.wa_id, true, 'Caso de prueba ' || t, 't20-' || t
  FROM chatbot.usuario u, unnest(ARRAY['A', 'B', 'C', 'D']) AS t
 WHERE u.wa_id = 'wa-t20';

CREATE TEMP TABLE antes_20 AS
  SELECT (SELECT count(*) FROM chatbot.incidencia_paciente_auditoria) AS historial,
         (SELECT sum(version_fila) FROM chatbot.incidencia_paciente) AS versiones;

SELECT set_config('app.actor', 'usuario:gestor-20', false);
SELECT pg_temp.asignar('t20-A', 'Urgente');
DO $$
DECLARE a chatbot.incidencia_etiqueta;
BEGIN
  SELECT * INTO a FROM chatbot.incidencia_etiqueta WHERE incidencia_paciente_id = pg_temp.incidencia('t20-A');
  ASSERT a.id IS NOT NULL AND a.activo AND a.eliminado_en IS NULL AND a.eliminado_por IS NULL, 'Q10 la asignacion nace vigente';
  ASSERT a.usuario_creacion = 'usuario:gestor-20' AND a.fecha_creacion IS NOT NULL AND a.version_fila = 1, 'Q10 queda quien y cuando la asigno';
END $$;

SELECT pg_temp.espera_error($q$SELECT pg_temp.asignar('t20-A', 'Urgente')$q$, '23505', 'Q11 una incidencia no lleva dos veces la misma etiqueta vigente');
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.incidencia_etiqueta (incidencia_paciente_id, etiqueta_id) VALUES (pg_temp.incidencia('t20-A'), 2147483647)$q$, '23503', 'Q12a la etiqueta debe existir');
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.incidencia_etiqueta (incidencia_paciente_id, etiqueta_id) VALUES (uuidv7(), pg_temp.etiqueta('Urgente'))$q$, '23503', 'Q12b la incidencia debe existir');
SELECT pg_temp.espera_regla($q$INSERT INTO chatbot.incidencia_etiqueta (incidencia_paciente_id, etiqueta_id, activo) VALUES (pg_temp.incidencia('t20-A'), pg_temp.etiqueta('AB'), false)$q$,
  'incidencia_etiqueta: una asignacion nace vigente', 'Q13a no se inserta una asignacion ya quitada');
SELECT pg_temp.espera_regla($q$INSERT INTO chatbot.incidencia_etiqueta (incidencia_paciente_id, etiqueta_id, eliminado_en, eliminado_por) VALUES (pg_temp.incidencia('t20-A'), pg_temp.etiqueta('AB'), now(), 'x')$q$,
  'incidencia_etiqueta: una asignacion nace vigente', 'Q13b no se inserta una asignacion con datos de quien la quito');

UPDATE catalogo.etiqueta SET activo = false WHERE nombre = 'Tono neutral';
SELECT pg_temp.espera_regla($q$SELECT pg_temp.asignar('t20-A', 'Tono neutral')$q$,
  'incidencia_etiqueta: la etiqueta esta retirada y no se puede asignar', 'Q14 una etiqueta retirada no se asigna');
DO $$
BEGIN
  ASSERT pg_temp.vigentes('t20-A') = 1, 'Q14 el rechazo no deja la asignacion';
END $$;
UPDATE catalogo.etiqueta SET activo = true WHERE nombre = 'Tono neutral';
SELECT pg_temp.asignar('t20-A', 'Tono neutral');

SELECT pg_temp.asignar('t20-C', 'Urgente');
UPDATE chatbot.incidencia_paciente SET activo = false, eliminado_en = now(), eliminado_por = 'usuario:gestor-20' WHERE trace_id = 't20-C';
SELECT pg_temp.espera_regla($q$SELECT pg_temp.asignar('t20-C', 'AB')$q$,
  'incidencia_etiqueta: la incidencia esta eliminada y no admite etiquetas nuevas', 'Q15 una incidencia eliminada no recibe etiquetas');
SELECT pg_temp.quitar('t20-C', 'Urgente');
DO $$
BEGIN
  ASSERT pg_temp.vigentes('t20-C') = 0, 'Q15 a una incidencia eliminada si se le puede quitar una etiqueta';
END $$;

SELECT pg_sleep(0.05);
SELECT set_config('app.actor', 'usuario:gestor-21', false);
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_etiqueta SET eliminado_en = now(), eliminado_por = 'x' WHERE incidencia_paciente_id = pg_temp.incidencia('t20-A') AND etiqueta_id = pg_temp.etiqueta('Urgente')$q$,
  '23514', 'Q16a una asignacion vigente no lleva datos de quien la quito');
UPDATE chatbot.incidencia_etiqueta SET activo = false, eliminado_en = '2000-01-01', eliminado_por = 'usuario:otro'
 WHERE incidencia_paciente_id = pg_temp.incidencia('t20-A') AND etiqueta_id = pg_temp.etiqueta('Urgente') AND activo;
DO $$
DECLARE a chatbot.incidencia_etiqueta;
BEGIN
  SELECT * INTO a FROM chatbot.incidencia_etiqueta
   WHERE incidencia_paciente_id = pg_temp.incidencia('t20-A') AND etiqueta_id = pg_temp.etiqueta('Urgente');
  ASSERT NOT a.activo AND a.eliminado_por = 'usuario:gestor-21' AND a.eliminado_en > a.fecha_creacion, 'Q16b quien y cuando la quito lo llena la base, no quien modifica';
  ASSERT a.usuario_creacion = 'usuario:gestor-20' AND a.version_fila = 2, 'Q16b se conserva quien la asigno';
  ASSERT pg_temp.vigentes('t20-A') = 1, 'Q16b la etiqueta quitada deja de estar vigente';
END $$;

SELECT pg_temp.espera_regla($q$UPDATE chatbot.incidencia_etiqueta SET activo = true, eliminado_en = NULL, eliminado_por = NULL WHERE incidencia_paciente_id = pg_temp.incidencia('t20-A') AND etiqueta_id = pg_temp.etiqueta('Urgente')$q$,
  'incidencia_etiqueta: una asignacion quitada no se modifica ni se reactiva', 'Q17a una asignacion quitada no se reactiva');
SELECT pg_temp.espera_regla($q$UPDATE chatbot.incidencia_etiqueta SET eliminado_por = 'usuario:otro' WHERE incidencia_paciente_id = pg_temp.incidencia('t20-A') AND etiqueta_id = pg_temp.etiqueta('Urgente')$q$,
  'incidencia_etiqueta: una asignacion quitada no se modifica ni se reactiva', 'Q17b quien la quito no se reescribe');

SELECT pg_temp.asignar('t20-A', 'Urgente');
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM chatbot.incidencia_etiqueta WHERE incidencia_paciente_id = pg_temp.incidencia('t20-A') AND etiqueta_id = pg_temp.etiqueta('Urgente')) = 2,
    'Q18 volver a asignar crea una fila nueva';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_etiqueta WHERE incidencia_paciente_id = pg_temp.incidencia('t20-A') AND etiqueta_id = pg_temp.etiqueta('Urgente') AND activo AND usuario_creacion = 'usuario:gestor-21') = 1,
    'Q18 solo la nueva esta vigente y lleva a quien la volvio a asignar';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_etiqueta WHERE incidencia_paciente_id = pg_temp.incidencia('t20-A') AND etiqueta_id = pg_temp.etiqueta('Urgente') AND NOT activo AND usuario_creacion = 'usuario:gestor-20' AND eliminado_por = 'usuario:gestor-21') = 1,
    'Q18 la anterior conserva quien la asigno y quien la quito';
END $$;

SELECT pg_temp.espera_regla($q$UPDATE chatbot.incidencia_etiqueta SET etiqueta_id = pg_temp.etiqueta('AB') WHERE incidencia_paciente_id = pg_temp.incidencia('t20-A') AND etiqueta_id = pg_temp.etiqueta('Urgente') AND activo$q$,
  'incidencia_etiqueta: la incidencia y la etiqueta de una asignacion no se pueden modificar', 'Q19a la etiqueta de una asignacion no cambia');
SELECT pg_temp.espera_regla($q$UPDATE chatbot.incidencia_etiqueta SET incidencia_paciente_id = pg_temp.incidencia('t20-B') WHERE incidencia_paciente_id = pg_temp.incidencia('t20-A') AND etiqueta_id = pg_temp.etiqueta('Urgente') AND activo$q$,
  'incidencia_etiqueta: la incidencia y la etiqueta de una asignacion no se pueden modificar', 'Q19b la incidencia de una asignacion no cambia');
SELECT pg_temp.espera_error($q$DELETE FROM chatbot.incidencia_etiqueta WHERE incidencia_paciente_id = pg_temp.incidencia('t20-A')$q$, '23001', 'Q20 una asignacion no se borra fisicamente');

INSERT INTO catalogo.etiqueta (nombre, tono) SELECT 'Tope ' || lpad(n::text, 2, '0'), 'primary' FROM generate_series(1, 12) AS n;
INSERT INTO chatbot.incidencia_etiqueta (incidencia_paciente_id, etiqueta_id)
SELECT pg_temp.incidencia('t20-B'), id FROM catalogo.etiqueta WHERE nombre BETWEEN 'Tope 01' AND 'Tope 10' ORDER BY nombre;
DO $$
BEGIN
  ASSERT pg_temp.vigentes('t20-B') = 10, 'Q21 una incidencia admite 10 etiquetas vigentes';
END $$;
SELECT pg_temp.espera_regla($q$SELECT pg_temp.asignar('t20-B', 'Tope 11')$q$,
  'incidencia_etiqueta: la incidencia ya tiene 10 etiquetas', 'Q22 la undecima etiqueta se rechaza');
SELECT pg_temp.espera_regla($q$INSERT INTO chatbot.incidencia_etiqueta (incidencia_paciente_id, etiqueta_id) SELECT pg_temp.incidencia('t20-D'), id FROM catalogo.etiqueta WHERE nombre LIKE 'Tope %'$q$,
  'incidencia_etiqueta: la incidencia ya tiene 10 etiquetas', 'Q23 el tope tambien vale al insertar varias a la vez');
DO $$
BEGIN
  ASSERT pg_temp.vigentes('t20-D') = 0, 'Q23 el rechazo no deja ninguna';
END $$;
SELECT pg_temp.espera_error($q$SELECT pg_temp.asignar('t20-B', 'Tope 05')$q$, '23505', 'Q24 con el tope lleno, repetir una etiqueta vigente se rechaza por repetida, no por el tope');

SELECT pg_temp.quitar('t20-B', 'Tope 10');
SELECT pg_temp.asignar('t20-B', 'Tope 11');
DO $$
BEGIN
  ASSERT pg_temp.vigentes('t20-B') = 10, 'Q25 quitar una libera su cupo: las quitadas no cuentan';
  ASSERT pg_temp.vigentes('t20-A') = 2, 'Q25 el tope es por incidencia';
END $$;

UPDATE catalogo.etiqueta SET activo = false WHERE nombre = 'Tope 01';
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM chatbot.incidencia_etiqueta WHERE etiqueta_id = pg_temp.etiqueta('Tope 01') AND activo) = 1, 'Q26 la incidencia conserva la etiqueta retirada';
END $$;
SELECT pg_temp.quitar('t20-B', 'Tope 01');
SELECT pg_temp.espera_regla($q$SELECT pg_temp.asignar('t20-B', 'Tope 01')$q$,
  'incidencia_etiqueta: la etiqueta esta retirada y no se puede asignar', 'Q27 la etiqueta retirada se puede quitar pero no volver a asignar');

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente_auditoria) = (SELECT historial FROM antes_20) + 1, 'Q28 solo el borrado logico de la incidencia C escribio en el historial';
  ASSERT (SELECT sum(version_fila) FROM chatbot.incidencia_paciente) = (SELECT versiones FROM antes_20) + 1, 'Q28 asignar y quitar etiquetas no modifica la incidencia';
END $$;

DO $$
BEGIN
  ASSERT (SELECT indexdef FROM pg_indexes WHERE schemaname = 'chatbot' AND indexname = 'uq_incidencia_etiqueta_activa')
         ~ 'UNIQUE INDEX .* \(incidencia_paciente_id, etiqueta_id\) WHERE activo', 'Q29 indice de las etiquetas vigentes de un grupo de incidencias';
  ASSERT (SELECT indexdef FROM pg_indexes WHERE schemaname = 'chatbot' AND indexname = 'ix_incidencia_etiqueta_etiqueta_activa')
         ~ '\(etiqueta_id, incidencia_paciente_id\) WHERE activo', 'Q29 indice de las incidencias vigentes de una etiqueta';
END $$;

CREATE EXTENSION IF NOT EXISTS dblink;
INSERT INTO chatbot.incidencia_etiqueta (incidencia_paciente_id, etiqueta_id)
SELECT pg_temp.incidencia('t20-D'), id FROM catalogo.etiqueta WHERE nombre BETWEEN 'Tope 02' AND 'Tope 10' ORDER BY nombre;
SELECT dblink_connect('c_a', format('dbname=%s user=%s', current_database(), current_user));
SELECT dblink_connect('c_b', format('dbname=%s user=%s', current_database(), current_user));
SELECT dblink_exec('c_a', 'BEGIN');
SELECT dblink_exec('c_a', $f$INSERT INTO chatbot.incidencia_etiqueta (incidencia_paciente_id, etiqueta_id) SELECT i.id, e.id FROM chatbot.incidencia_paciente i, catalogo.etiqueta e WHERE i.trace_id = 't20-D' AND e.nombre = 'Tope 11'$f$);
SELECT dblink_send_query('c_b', $f$INSERT INTO chatbot.incidencia_etiqueta (incidencia_paciente_id, etiqueta_id) SELECT i.id, e.id FROM chatbot.incidencia_paciente i, catalogo.etiqueta e WHERE i.trace_id = 't20-D' AND e.nombre = 'Tope 12'$f$);
SELECT pg_sleep(0.5);
DO $$
BEGIN
  ASSERT dblink_is_busy('c_b') = 1, 'Q30 la segunda asignacion de la misma incidencia espera mientras la primera no termina';
END $$;
SELECT dblink_exec('c_a', 'COMMIT');
DO $$
DECLARE
  v_rechazada boolean := false;
BEGIN
  BEGIN
    PERFORM * FROM dblink_get_result('c_b') AS t(r text);
  EXCEPTION WHEN OTHERS THEN
    v_rechazada := SQLERRM LIKE '%la incidencia ya tiene 10 etiquetas%';
  END;
  ASSERT v_rechazada, 'Q31 con un solo cupo libre, la segunda asignacion simultanea se rechaza por el tope';
  ASSERT pg_temp.vigentes('t20-D') = 10, 'Q31 la incidencia queda con 10 etiquetas vigentes';
END $$;
SELECT dblink_disconnect('c_a');
SELECT dblink_disconnect('c_b');

TRUNCATE chatbot.incidencia_etiqueta, catalogo.etiqueta, chatbot.archivo_recibido, chatbot.solicitud_carga, chatbot.evidencia, chatbot.incidencia_paciente_auditoria,
         ia.entrenamiento_categoria, chatbot.incidencia_analisis, chatbot.incidencia_paciente, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion;

\echo TODAS LAS PRUEBAS DE ETIQUETAS PASARON
