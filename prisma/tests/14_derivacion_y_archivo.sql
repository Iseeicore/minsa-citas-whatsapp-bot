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

-- Dos establecimientos de prueba, cada uno con su area, y un area desactivada
SELECT set_config('app.actor', 'sistema:prueba', false);
INSERT INTO catalogo.area (codigo, nombre, tipo_area_id, activo) VALUES
  ('T14-EESS-1', 'Establecimiento 1', 1, true),
  ('T14-EESS-2', 'Establecimiento 2', 1, true),
  ('T14-EESS-OFF', 'Area desactivada', 1, false);
INSERT INTO catalogo.establecimiento_salud (codigo_renipress, nombre, nivel_atencion_id, area_id)
SELECT v.renipress, a.nombre, 1, a.id FROM (VALUES ('9141', 'T14-EESS-1'), ('9142', 'T14-EESS-2')) AS v(renipress, area) JOIN catalogo.area a ON a.codigo = v.area;

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
END;
$$;

-- Lleva un caso clasificado (queja o reclamo) hasta el estado pedido por el camino normal, al area del establecimiento 1.
CREATE FUNCTION pg_temp.llevar(p_traza text, p_estado text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_estado IN ('DERIVADO', 'EN_GESTION', 'RESUELTO') THEN
    PERFORM set_config('app.actor', 'usuario:gestor-14', false);
    UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 6, area_destino_id = (SELECT id FROM catalogo.area WHERE codigo = 'T14-EESS-1')
     WHERE trace_id = p_traza;
  END IF;
  IF p_estado IN ('EN_GESTION', 'RESUELTO') THEN
    PERFORM set_config('app.actor', 'usuario:est-14', false);
    UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3 WHERE trace_id = p_traza;
  END IF;
  IF p_estado = 'RESUELTO' THEN
    UPDATE chatbot.incidencia_paciente SET resolucion = 'Atendido' WHERE trace_id = p_traza;
  END IF;
END;
$$;

-- ===== Derivar exige destino; las marcas las llena la base =====
SELECT pg_temp.nuevo('t14-queja', '9141', 2);
SELECT set_config('app.actor', 'usuario:gestor-14', false);

SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 6 WHERE trace_id = 't14-queja'$q$, '23514', 'X01 derivar sin area de destino falla');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3 WHERE trace_id = 't14-queja'$q$, '23514', 'X02 tomar sin area de destino falla');

UPDATE chatbot.incidencia_paciente SET area_destino_id = (SELECT id FROM catalogo.area WHERE codigo = 'T14-EESS-2') WHERE trace_id = 't14-queja';
DO $$
DECLARE r chatbot.incidencia_paciente;
BEGIN
  SELECT * INTO r FROM chatbot.incidencia_paciente WHERE trace_id = 't14-queja';
  ASSERT r.estado_incidencia_id = 2 AND r.derivado_en IS NULL AND r.derivado_por IS NULL, 'X03 asignar el area sin derivar no marca la derivacion';
END $$;

SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET area_destino_id = (SELECT id FROM catalogo.area WHERE codigo = 'T14-EESS-OFF') WHERE trace_id = 't14-queja'$q$, '23514', 'X04 no se deriva a un area desactivada');

UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 6 WHERE trace_id = 't14-queja';
DO $$
DECLARE r chatbot.incidencia_paciente;
BEGIN
  SELECT * INTO r FROM chatbot.incidencia_paciente WHERE trace_id = 't14-queja';
  ASSERT r.estado_incidencia_id = 6 AND r.area_destino_id = (SELECT id FROM catalogo.area WHERE codigo = 'T14-EESS-2'), 'X05 una queja se deriva al area de un establecimiento';
  ASSERT r.derivado_en IS NOT NULL AND r.derivado_por = 'usuario:gestor-14' AND r.tomado_en IS NULL, 'X05 la base llena quien y cuando derivo';
  ASSERT r.establecimiento_id = (SELECT id FROM catalogo.establecimiento_salud WHERE codigo_renipress = '9141'), 'X06 el establecimiento de origen sigue siendo el que reporto, aunque el destino sea otro';
END $$;

SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET derivado_por = 'otro' WHERE trace_id = 't14-queja'$q$, '23514', 'X07a quien derivo lo llena la base');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET derivado_en = now() WHERE trace_id = 't14-queja'$q$, '23514', 'X07b cuando derivo lo llena la base');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET tomado_por = 'otro', tomado_en = now() WHERE trace_id = 't14-queja'$q$, '23514', 'X07c la toma la llena la base');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET archivado_en = now() WHERE trace_id = 't14-queja'$q$, '23514', 'X07d la fecha de archivado la llena la base');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET establecimiento_id = (SELECT id FROM catalogo.establecimiento_salud WHERE codigo_renipress = '9142') WHERE trace_id = 't14-queja'$q$, '23514', 'X08 el origen no se cambia');

SELECT pg_sleep(0.05);
SELECT set_config('app.actor', 'usuario:gestor-14b', false);
UPDATE chatbot.incidencia_paciente SET area_destino_id = (SELECT id FROM catalogo.area WHERE codigo = 'T14-EESS-1') WHERE trace_id = 't14-queja';
DO $$
DECLARE r chatbot.incidencia_paciente;
BEGIN
  SELECT * INTO r FROM chatbot.incidencia_paciente WHERE trace_id = 't14-queja';
  ASSERT r.estado_incidencia_id = 6 AND r.derivado_por = 'usuario:gestor-14b', 'X09 reasignar el area mientras esta DERIVADO vuelve a marcar quien derivo';
END $$;

SELECT set_config('app.actor', 'usuario:est-14', false);
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3 WHERE trace_id = 't14-queja';
DO $$
DECLARE r chatbot.incidencia_paciente;
BEGIN
  SELECT * INTO r FROM chatbot.incidencia_paciente WHERE trace_id = 't14-queja';
  ASSERT r.tomado_en IS NOT NULL AND r.tomado_por = 'usuario:est-14' AND r.derivado_por = 'usuario:gestor-14b', 'X10 la base llena quien y cuando tomo el caso sin tocar la derivacion';
END $$;

SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET area_destino_id = (SELECT id FROM catalogo.area WHERE codigo = 'T14-EESS-2') WHERE trace_id = 't14-queja'$q$, '23514', 'X11 en gestion el area ya no se reasigna');

UPDATE chatbot.incidencia_paciente SET resolucion = 'Se atendio la queja' WHERE trace_id = 't14-queja';
DO $$
BEGIN
  ASSERT (SELECT estado_incidencia_id = 4 AND resuelto_por = 'usuario:est-14' FROM chatbot.incidencia_paciente WHERE trace_id = 't14-queja'), 'X12 el area resuelve y la base firma';
END $$;

-- ===== La corrupcion siempre va a OTRANS =====
SELECT pg_temp.nuevo('t14-corrupcion', '9141', 1);
SELECT set_config('app.actor', 'usuario:gestor-14', false);
DO $$
DECLARE r chatbot.incidencia_paciente;
BEGIN
  SELECT * INTO r FROM chatbot.incidencia_paciente WHERE trace_id = 't14-corrupcion';
  ASSERT r.estado_incidencia_id = 2 AND r.area_destino_id = (SELECT id FROM catalogo.area WHERE codigo = 'OTRANS'), 'Y01 la denuncia por corrupcion se asigna sola a OTRANS al clasificarse';
  ASSERT r.establecimiento_id = (SELECT id FROM catalogo.establecimiento_salud WHERE codigo_renipress = '9141'), 'Y01 conserva su establecimiento de origen';
  ASSERT r.derivado_en IS NULL, 'Y01 asignarla no cuenta como derivacion';
END $$;

SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 6, area_destino_id = (SELECT id FROM catalogo.area WHERE codigo = 'T14-EESS-1') WHERE trace_id = 't14-corrupcion'$q$, '23514', 'Y02 la corrupcion no se deriva a un establecimiento');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET area_destino_id = (SELECT id FROM catalogo.area WHERE codigo = 'T14-EESS-1') WHERE trace_id = 't14-corrupcion'$q$, '23514', 'Y03 ni se le asigna su area estando clasificada');

UPDATE chatbot.incidencia_paciente SET area_destino_id = NULL WHERE trace_id = 't14-corrupcion';
DO $$
BEGIN
  ASSERT (SELECT area_destino_id FROM chatbot.incidencia_paciente WHERE trace_id = 't14-corrupcion') = (SELECT id FROM catalogo.area WHERE codigo = 'OTRANS'),
    'Y04 quitarle el area a una denuncia la devuelve a OTRANS';
END $$;

SELECT set_config('app.actor', 'usuario:otrans-14', false);
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3 WHERE trace_id = 't14-corrupcion';
DO $$
DECLARE r chatbot.incidencia_paciente;
BEGIN
  SELECT * INTO r FROM chatbot.incidencia_paciente WHERE trace_id = 't14-corrupcion';
  ASSERT r.estado_incidencia_id = 3 AND r.tomado_por = 'usuario:otrans-14' AND r.derivado_por IS NULL, 'Y05 OTRANS toma la denuncia directo, sin derivarla';
END $$;

-- Una queja ya derivada a un establecimiento que se corrige a corrupcion pasa sola a OTRANS
SELECT pg_temp.nuevo('t14-corregida-derivada', '9142', 2);
SELECT pg_temp.llevar('t14-corregida-derivada', 'DERIVADO');
SELECT pg_sleep(0.05);
SELECT set_config('app.actor', 'usuario:gestor-14c', false);
UPDATE chatbot.incidencia_paciente SET categoria_id = 1 WHERE trace_id = 't14-corregida-derivada';
DO $$
DECLARE r chatbot.incidencia_paciente;
BEGIN
  SELECT * INTO r FROM chatbot.incidencia_paciente WHERE trace_id = 't14-corregida-derivada';
  ASSERT r.categoria_id = 1 AND r.categoria_ia_id = 2 AND r.categoria_corregida_por = 'usuario:gestor-14c', 'Y06 la categoria se corrige a corrupcion';
  ASSERT r.area_destino_id = (SELECT id FROM catalogo.area WHERE codigo = 'OTRANS'), 'Y06 el caso sale del establecimiento y pasa a OTRANS';
  ASSERT r.derivado_por = 'usuario:gestor-14c' AND r.estado_incidencia_id = 6, 'Y06 la base registra el cambio de area como nueva derivacion';
  ASSERT r.establecimiento_id = (SELECT id FROM catalogo.establecimiento_salud WHERE codigo_renipress = '9142'), 'Y06 el origen se conserva';
END $$;
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET area_destino_id = (SELECT id FROM catalogo.area WHERE codigo = 'T14-EESS-1') WHERE trace_id = 't14-corregida-derivada'$q$, '23514', 'Y07 despues de corregirla no se puede devolver a un establecimiento');

-- ...y tambien si ya estaba en gestion en el establecimiento
SELECT pg_temp.nuevo('t14-corregida-en-gestion', '9141', 3);
SELECT pg_temp.llevar('t14-corregida-en-gestion', 'EN_GESTION');
SELECT set_config('app.actor', 'usuario:gestor-14c', false);
UPDATE chatbot.incidencia_paciente SET categoria_id = 1 WHERE trace_id = 't14-corregida-en-gestion';
DO $$
BEGIN
  ASSERT (SELECT area_destino_id FROM chatbot.incidencia_paciente WHERE trace_id = 't14-corregida-en-gestion') = (SELECT id FROM catalogo.area WHERE codigo = 'OTRANS'),
    'Y08 una queja en gestion que se corrige a corrupcion tambien pasa a OTRANS';
END $$;

-- Con dos areas que reciben casos sensibles la base no elige: la persona asigna
BEGIN;
INSERT INTO catalogo.area (codigo, nombre, tipo_area_id) VALUES ('T14-OTRANS-2', 'Otra oficina de transparencia', 2);
SELECT pg_temp.nuevo('t14-dos-areas', '9141', 1);
SELECT set_config('app.actor', 'usuario:gestor-14', false);
DO $$
BEGIN
  ASSERT (SELECT area_destino_id FROM chatbot.incidencia_paciente WHERE trace_id = 't14-dos-areas') IS NULL, 'Y09 con dos areas que reciben casos sensibles la base no asigna sola';
END $$;
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 6 WHERE trace_id = 't14-dos-areas'$q$, '23514', 'Y10 y no se deriva sin destino');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET area_destino_id = (SELECT id FROM catalogo.area WHERE codigo = 'T14-EESS-1') WHERE trace_id = 't14-dos-areas'$q$, '23514', 'Y11 ni se manda a un establecimiento');
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 6, area_destino_id = (SELECT id FROM catalogo.area WHERE codigo = 'T14-OTRANS-2') WHERE trace_id = 't14-dos-areas';
DO $$
BEGIN
  ASSERT (SELECT estado_incidencia_id FROM chatbot.incidencia_paciente WHERE trace_id = 't14-dos-areas') = 6, 'Y12 se deriva a cualquiera de las areas que reciben casos sensibles';
END $$;
ROLLBACK;

-- ===== Archivado: siempre con motivo =====
SELECT pg_temp.nuevo('t14-filtro', '9141', NULL);
SELECT pg_temp.nuevo('t14-persona-registrado', '9141', NULL);
SELECT pg_temp.nuevo('t14-persona-clasificado', '9141', 3);

SELECT set_config('app.actor', 'sistema:filtro', false);
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 3 WHERE trace_id = 't14-filtro';
SELECT set_config('app.actor', 'usuario:gestor-14', false);
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 3 WHERE trace_id IN ('t14-persona-registrado', 't14-persona-clasificado');
DO $$
BEGIN
  ASSERT (SELECT bool_and(estado_incidencia_id = 7 AND motivo_archivo_id = 3 AND archivado_en IS NOT NULL) FROM chatbot.incidencia_paciente
           WHERE trace_id IN ('t14-filtro', 't14-persona-registrado', 't14-persona-clasificado')),
    'Z01 el filtro y las personas archivan por datos insuficientes desde REGISTRADO o CLASIFICADO, y la base pone la fecha';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente_auditoria a JOIN chatbot.incidencia_paciente i ON i.id = a.incidencia_paciente_id
           WHERE i.trace_id = 't14-filtro' AND a.actor = 'sistema:filtro' AND a.cambios ? 'motivo_archivo_id' AND a.cambios ? 'archivado_en') = 1,
    'Z02 el historial guarda quien archivo y el motivo';
END $$;

SELECT pg_temp.nuevo('t14-rechazo-registrado', '9141', NULL);
SELECT pg_temp.nuevo('t14-rechazo-clasificado', '9141', 3);
SELECT pg_temp.nuevo('t14-rechazo-derivado', '9141', 3);
SELECT pg_temp.llevar('t14-rechazo-derivado', 'DERIVADO');
SELECT pg_temp.nuevo('t14-rechazo-gestion', '9141', 3);
SELECT pg_temp.llevar('t14-rechazo-gestion', 'EN_GESTION');
SELECT pg_temp.nuevo('t14-rechazo-resuelto', '9141', 3);
SELECT pg_temp.llevar('t14-rechazo-resuelto', 'RESUELTO');

SELECT set_config('app.actor', 'sistema:vencimiento', false);
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 3 WHERE trace_id = 't14-rechazo-registrado'$q$, '23514', 'Z03 el vencimiento no archiva por datos insuficientes');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 1 WHERE trace_id = 't14-rechazo-clasificado'$q$, '23514', 'Z04 un caso abierto vencido no se archiva como resuelto');
SELECT set_config('app.actor', 'sistema:archivado', false);
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 3 WHERE trace_id = 't14-rechazo-registrado'$q$, '23514', 'Z05 el archivador de resueltas no archiva por datos insuficientes');
SELECT set_config('app.actor', 'operador:gestor', false);
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 3 WHERE trace_id = 't14-rechazo-registrado'$q$, '23514', 'Z06 solo sistema:filtro o usuario:% archivan por datos insuficientes');
SELECT set_config('app.actor', 'usuario:gestor-14', false);
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 3 WHERE trace_id = 't14-rechazo-derivado'$q$, '23514', 'Z07 un caso derivado no se archiva por datos insuficientes');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 3 WHERE trace_id = 't14-rechazo-gestion'$q$, '23514', 'Z08 un caso en gestion no se archiva por datos insuficientes');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 3 WHERE trace_id = 't14-rechazo-resuelto'$q$, '23514', 'Z09 un caso resuelto no se archiva por datos insuficientes');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 2 WHERE trace_id = 't14-rechazo-clasificado'$q$, '23514', 'Z10 una persona no archiva como vencido');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 1 WHERE trace_id = 't14-rechazo-clasificado'$q$, '23514', 'Z11 una persona no archiva un caso abierto como resuelto');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7 WHERE trace_id = 't14-rechazo-clasificado'$q$, '23514', 'Z12 archivar sin motivo falla');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 2 WHERE trace_id = 't14-rechazo-resuelto'$q$, '23514', 'Z13 un resuelto no se archiva como vencido');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET motivo_archivo_id = 3 WHERE trace_id = 't14-rechazo-clasificado'$q$, '23514', 'Z14 el motivo solo se indica al archivar');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET motivo_archivo_id = 2 WHERE trace_id = 't14-filtro'$q$, '23514', 'Z15 el motivo de un archivado no se cambia');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 2 WHERE trace_id = 't14-filtro'$q$, '23514', 'Z16 un archivado no vuelve atras');

UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7 WHERE trace_id = 't14-rechazo-resuelto';
DO $$
BEGIN
  ASSERT (SELECT m.codigo FROM chatbot.incidencia_paciente i JOIN catalogo.motivo_archivo m ON m.id = i.motivo_archivo_id WHERE i.trace_id = 't14-rechazo-resuelto') = 'RESUELTA_VIGENCIA',
    'Z17 al archivar un resuelto la base deduce RESUELTA_VIGENCIA';
END $$;

-- Las funciones de archivado por lote deducen el motivo
SELECT pg_temp.nuevo('t14-lote-resuelto', '9142', 3);
SELECT pg_temp.llevar('t14-lote-resuelto', 'RESUELTO');
SELECT pg_temp.nuevo('t14-lote-abierto', '9142', 2);
SELECT pg_temp.llevar('t14-lote-abierto', 'EN_GESTION');
ALTER TABLE chatbot.incidencia_paciente DISABLE TRIGGER USER;
UPDATE chatbot.incidencia_paciente SET resuelto_en = now() - interval '4 days' WHERE trace_id = 't14-lote-resuelto';
UPDATE chatbot.incidencia_paciente SET fecha_creacion = now() - interval '5 days' WHERE trace_id = 't14-lote-abierto';
ALTER TABLE chatbot.incidencia_paciente ENABLE TRIGGER USER;
DO $$
BEGIN
  ASSERT chatbot.archivar_incidencias_resueltas(3, 1000) = 1, 'Z18 se archiva la resuelta hace mas de 3 dias';
  ASSERT chatbot.archivar_incidencias_vencidas(3, 1000) = 1, 'Z18 se archiva la abierta que vencio';
  ASSERT (SELECT string_agg(i.trace_id || '=' || m.codigo || '/' || i.usuario_modificacion, ',' ORDER BY i.trace_id)
            FROM chatbot.incidencia_paciente i JOIN catalogo.motivo_archivo m ON m.id = i.motivo_archivo_id WHERE i.trace_id LIKE 't14-lote-%')
         = 't14-lote-abierto=VENCIDA_SIN_ATENDER/sistema:vencimiento,t14-lote-resuelto=RESUELTA_VIGENCIA/sistema:archivado',
    'Z19 cada funcion deduce el motivo y firma como sistema:archivado o sistema:vencimiento';
  ASSERT (SELECT bool_and(archivado_en IS NOT NULL) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 't14-lote-%'), 'Z20 la base llena la fecha de archivado';
END $$;

TRUNCATE chatbot.archivo_recibido, chatbot.solicitud_carga, chatbot.evidencia, chatbot.incidencia_paciente_auditoria,
         ia.entrenamiento_categoria, chatbot.incidencia_analisis, chatbot.incidencia_paciente, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion;

\echo TODAS LAS PRUEBAS DE DERIVACION Y ARCHIVO PASARON
