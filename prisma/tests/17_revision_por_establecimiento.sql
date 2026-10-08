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

-- Dos establecimientos de prueba, cada uno con su area
SELECT set_config('app.actor', 'sistema:prueba', false);
INSERT INTO catalogo.area (codigo, nombre, tipo_area_id) VALUES
  ('T17-EESS-1', 'Establecimiento 17-1', 1),
  ('T17-EESS-2', 'Establecimiento 17-2', 1);
INSERT INTO catalogo.establecimiento_salud (codigo_renipress, nombre, nivel_atencion_id, area_id)
SELECT v.renipress, a.nombre, 1, a.id FROM (VALUES ('9171', 'T17-EESS-1'), ('9172', 'T17-EESS-2')) AS v(renipress, area) JOIN catalogo.area a ON a.codigo = v.area;

CREATE FUNCTION pg_temp.nuevo(p_traza text, p_categoria integer) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_usuario uuid;
BEGIN
  PERFORM set_config('app.actor', 'ciudadano:' || p_traza, false);
  INSERT INTO chatbot.usuario (wa_id) VALUES ('wa-' || p_traza) RETURNING id INTO v_usuario;
  INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id, establecimiento_id)
  VALUES (1, v_usuario, 'wa-' || p_traza, true, 'Caso ' || p_traza, p_traza,
          (SELECT id FROM catalogo.establecimiento_salud WHERE codigo_renipress = '9171'));
  IF p_categoria IS NOT NULL THEN
    PERFORM set_config('app.actor', 'sistema:ia', false);
    UPDATE chatbot.incidencia_paciente SET categoria_ia_id = p_categoria, categoria_confianza = 80, version_clasificador = 'v1' WHERE trace_id = p_traza;
  END IF;
END;
$$;

-- Lleva un caso clasificado hasta el estado pedido por el camino normal, al area del establecimiento 1.
CREATE FUNCTION pg_temp.llevar(p_traza text, p_estado text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_estado IN ('DERIVADO', 'EN_GESTION', 'RESUELTO') THEN
    PERFORM set_config('app.actor', 'usuario:gestor-17', false);
    UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 6, area_destino_id = (SELECT id FROM catalogo.area WHERE codigo = 'T17-EESS-1')
     WHERE trace_id = p_traza;
  END IF;
  IF p_estado IN ('EN_GESTION', 'RESUELTO') THEN
    PERFORM set_config('app.actor', 'usuario:est-17', false);
    UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3 WHERE trace_id = p_traza;
  END IF;
  IF p_estado = 'RESUELTO' THEN
    UPDATE chatbot.incidencia_paciente SET medidas_tomadas = 'Se atendio el caso', fundamento = 'Caso procedente', resultado_resolucion_id = 1 WHERE trace_id = p_traza;
  END IF;
END;
$$;

CREATE FUNCTION pg_temp.apto(p_traza text) RETURNS text
LANGUAGE sql AS $$
  SELECT string_agg(e.apto_entrenamiento::text, ',') FROM ia.entrenamiento_categoria e
    JOIN chatbot.incidencia_paciente i ON i.id = e.incidencia_paciente_id WHERE i.trace_id = p_traza;
$$;

-- ===== Resolucion en tres campos =====
SELECT pg_temp.nuevo('t17-res-a', 3);
SELECT pg_temp.nuevo('t17-res-b', 3);
SELECT pg_temp.nuevo('t17-chk', 3);
SELECT pg_temp.nuevo('t17-chk2', 3);
SELECT pg_temp.nuevo('t17-chk3', 3);
SELECT pg_temp.llevar('t17-res-a', 'EN_GESTION');
SELECT pg_temp.llevar('t17-res-b', 'EN_GESTION');
SELECT set_config('app.actor', 'usuario:est-17', false);

SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET medidas_tomadas = 'Se atendio el reclamo' WHERE trace_id = 't17-res-a'$q$, '23514', 'R01 solo las medidas no resuelven: faltan el fundamento y el resultado');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET medidas_tomadas = 'Se atendio el reclamo', fundamento = 'Era procedente' WHERE trace_id = 't17-res-a'$q$, '23514', 'R02 falta el resultado');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET fundamento = 'Era procedente del todo', resultado_resolucion_id = 1 WHERE trace_id = 't17-res-a'$q$, '23514', 'R03 faltan las medidas');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET medidas_tomadas = 'corta', fundamento = 'Era procedente del todo', resultado_resolucion_id = 1 WHERE trace_id = 't17-res-a'$q$, '23514', 'R04 las medidas deben tener 10 caracteres o mas');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET medidas_tomadas = 'Se atendio el reclamo', fundamento = '         corto   ', resultado_resolucion_id = 1 WHERE trace_id = 't17-res-a'$q$, '23514', 'R05 el fundamento debe tener 10 caracteres o mas sin contar espacios');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET medidas_tomadas = 'Se atendio el reclamo', fundamento = 'Era procedente del todo', resultado_resolucion_id = 99 WHERE trace_id = 't17-res-a'$q$, '23503', 'R06 el resultado debe ser uno del catalogo');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET fundamento = 'Era procedente del todo' WHERE trace_id = 't17-res-a'$q$, '23514', 'R07 el fundamento no se registra suelto');

UPDATE chatbot.incidencia_paciente SET medidas_tomadas = 'Se atendio el reclamo', fundamento = 'Era procedente del todo', resultado_resolucion_id = 1 WHERE trace_id = 't17-res-a';
UPDATE chatbot.incidencia_paciente SET medidas_tomadas = 'Se cierra sin mas gestion', fundamento = 'El paciente retiro el reclamo', resultado_resolucion_id = 2 WHERE trace_id = 't17-res-b';
DO $$
DECLARE r chatbot.incidencia_paciente;
BEGIN
  SELECT * INTO r FROM chatbot.incidencia_paciente WHERE trace_id = 't17-res-a';
  ASSERT r.estado_incidencia_id = 4 AND r.resuelto_en IS NOT NULL AND r.resuelto_por = 'usuario:est-17', 'R08 con los tres campos el caso pasa a RESUELTO y la base firma';
  ASSERT r.medidas_tomadas = 'Se atendio el reclamo' AND r.fundamento = 'Era procedente del todo' AND r.resultado_resolucion_id = 1, 'R08 se guardan los tres campos';
  ASSERT (SELECT r2.resultado_resolucion_id FROM chatbot.incidencia_paciente r2 WHERE r2.trace_id = 't17-res-b') = 2, 'R09 el resultado CERRADO tambien se acepta';
END $$;

SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET medidas_tomadas = 'Otras medidas distintas' WHERE trace_id = 't17-res-a'$q$, '23514', 'R10 las medidas se registran una sola vez');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET fundamento = 'Otro fundamento distinto' WHERE trace_id = 't17-res-a'$q$, '23514', 'R11 el fundamento se registra una sola vez');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET resultado_resolucion_id = 2 WHERE trace_id = 't17-res-a'$q$, '23514', 'R12 el resultado se registra una sola vez');

-- Las reglas tambien viven en CHECK: aunque se apaguen los disparadores
ALTER TABLE chatbot.incidencia_paciente DISABLE TRIGGER USER;
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 4 WHERE trace_id = 't17-chk'$q$, '23514', 'R13 un caso RESUELTO exige la resolucion (CHECK)');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET medidas_tomadas = 'Se atendio el reclamo', resuelto_en = now(), resuelto_por = 'x' WHERE trace_id = 't17-chk'$q$, '23514', 'R14 las medidas sin fundamento ni resultado violan el CHECK');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET medidas_tomadas = 'corta', fundamento = 'Era procedente del todo', resultado_resolucion_id = 1, resuelto_en = now(), resuelto_por = 'x' WHERE trace_id = 't17-chk'$q$, '23514', 'R15 las medidas cortas violan el CHECK');
ALTER TABLE chatbot.incidencia_paciente ENABLE TRIGGER USER;

-- ===== Archivado manual desde cualquier estado abierto =====
SELECT pg_temp.nuevo('t17-reg', NULL);
SELECT pg_temp.nuevo('t17-cla', 3);
SELECT pg_temp.nuevo('t17-der', 3);
SELECT pg_temp.llevar('t17-der', 'DERIVADO');
SELECT pg_temp.nuevo('t17-ges', 3);
SELECT pg_temp.llevar('t17-ges', 'EN_GESTION');
SELECT pg_temp.nuevo('t17-res', 3);
SELECT pg_temp.llevar('t17-res', 'RESUELTO');
SELECT pg_temp.nuevo('t17-neg', 3);
SELECT pg_temp.llevar('t17-neg', 'EN_GESTION');

SELECT set_config('app.actor', 'usuario:rev-17', false);
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 4 WHERE trace_id = 't17-neg'$q$, '23514', 'A01 no corresponde exige justificacion');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 3 WHERE trace_id = 't17-neg'$q$, '23514', 'A02 datos insuficientes exige justificacion');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 4, archivo_detalle = 'corto' WHERE trace_id = 't17-neg'$q$, '23514', 'A03 la justificacion debe tener 10 caracteres o mas');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 4, archivo_detalle = '            ' WHERE trace_id = 't17-neg'$q$, '23514', 'A04 una justificacion de espacios no vale');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 4, archivo_detalle = 'No es una queja ni un reclamo' WHERE trace_id = 't17-res'$q$, '23514', 'A05 un caso resuelto no se archiva a mano');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 1, archivo_detalle = 'Resuelta hace tiempo ya' WHERE trace_id = 't17-neg'$q$, '23514', 'A06 un caso abierto no se archiva a mano como resuelto');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET archivo_detalle = 'Detalle sin archivar el caso' WHERE trace_id = 't17-neg'$q$, '23514', 'A07 la justificacion solo se indica al archivar');

SELECT set_config('app.actor', 'sistema:filtro', false);
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 4, archivo_detalle = 'No corresponde a este centro' WHERE trace_id = 't17-cla'$q$, '23514', 'A08 el filtro no archiva por no corresponde');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 3, archivo_detalle = 'Faltan datos para gestionar' WHERE trace_id = 't17-ges'$q$, '23514', 'A09 el filtro no archiva un caso en gestion');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 3, archivo_detalle = 'Faltan datos para gestionar' WHERE trace_id = 't17-der'$q$, '23514', 'A10 el filtro no archiva un caso derivado');
SELECT set_config('app.actor', 'operador:gestor', false);
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 4, archivo_detalle = 'No corresponde a este centro' WHERE trace_id = 't17-cla'$q$, '23514', 'A11 solo una persona (usuario:%) archiva por no corresponde');
SELECT set_config('app.actor', 'sistema:vencimiento', false);
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 4, archivo_detalle = 'No corresponde a este centro' WHERE trace_id = 't17-cla'$q$, '23514', 'A12 el vencimiento no archiva por no corresponde');

SELECT set_config('app.actor', 'usuario:rev-17', false);
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 4, archivo_detalle = 'No es de este establecimiento' WHERE trace_id = 't17-reg';
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 4, archivo_detalle = 'No es una queja ni un reclamo' WHERE trace_id = 't17-cla';
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 3, archivo_detalle = 'Faltan datos de contacto del paciente' WHERE trace_id = 't17-der';
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 4, archivo_detalle = 'Corresponde a otro establecimiento' WHERE trace_id = 't17-ges';
DO $$
BEGIN
  ASSERT (SELECT bool_and(estado_incidencia_id = 7 AND archivado_en IS NOT NULL AND archivo_detalle IS NOT NULL) FROM chatbot.incidencia_paciente
           WHERE trace_id IN ('t17-reg', 't17-cla', 't17-der', 't17-ges')), 'A13 una persona archiva a mano desde REGISTRADO, CLASIFICADO, DERIVADO y EN_GESTION, con su justificacion';
  ASSERT (SELECT string_agg(i.trace_id || '=' || m.codigo, ',' ORDER BY i.trace_id) FROM chatbot.incidencia_paciente i JOIN catalogo.motivo_archivo m ON m.id = i.motivo_archivo_id
           WHERE i.trace_id IN ('t17-reg', 't17-cla', 't17-der', 't17-ges'))
         = 't17-cla=NO_CORRESPONDE,t17-der=DATOS_INSUFICIENTES,t17-ges=NO_CORRESPONDE,t17-reg=NO_CORRESPONDE', 'A14 cada archivado lleva su motivo';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente_auditoria a JOIN chatbot.incidencia_paciente i ON i.id = a.incidencia_paciente_id
           WHERE i.trace_id = 't17-ges' AND a.actor = 'usuario:rev-17' AND a.cambios ? 'archivo_detalle' AND a.cambios ? 'motivo_archivo_id') = 1,
    'A15 el historial guarda quien archivo, el motivo y la justificacion';
END $$;

SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET archivo_detalle = 'Otra justificacion distinta' WHERE trace_id = 't17-ges'$q$, '23514', 'A16 la justificacion de un archivado no se cambia');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET motivo_archivo_id = 3 WHERE trace_id = 't17-ges'$q$, '23514', 'A17 el motivo de un archivado no se cambia');

-- El CHECK tambien rige con los disparadores apagados
ALTER TABLE chatbot.incidencia_paciente DISABLE TRIGGER USER;
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 4, archivado_en = now() WHERE trace_id = 't17-chk2'$q$, '23514', 'A18 un motivo manual sin justificacion viola el CHECK');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET archivo_detalle = 'Justificacion sin motivo de archivo' WHERE trace_id = 't17-chk2'$q$, '23514', 'A19 una justificacion sin archivado viola el CHECK');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 3, archivado_en = now(), archivo_detalle = 'corto' WHERE trace_id = 't17-chk2'$q$, '23514', 'A20 una justificacion corta viola el CHECK');
ALTER TABLE chatbot.incidencia_paciente ENABLE TRIGGER USER;

-- Los archivados automaticos no necesitan justificacion
SELECT pg_temp.nuevo('t17-auto', 3);
SELECT pg_temp.llevar('t17-auto', 'EN_GESTION');
ALTER TABLE chatbot.incidencia_paciente DISABLE TRIGGER USER;
UPDATE chatbot.incidencia_paciente SET fecha_creacion = now() - interval '10 days' WHERE trace_id = 't17-auto';
ALTER TABLE chatbot.incidencia_paciente ENABLE TRIGGER USER;
DO $$
BEGIN
  ASSERT chatbot.archivar_incidencias_vencidas(3, 1000) = 1, 'A21 el vencimiento archiva el caso abierto';
  ASSERT (SELECT archivo_detalle IS NULL AND estado_incidencia_id = 7 FROM chatbot.incidencia_paciente WHERE trace_id = 't17-auto'), 'A21 un archivado automatico queda sin justificacion';
END $$;

-- ===== Reabrir =====
SELECT set_config('app.actor', 'usuario:rev-17', false);
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3 WHERE trace_id = 't17-der'$q$, '23514', 'B01 reabrir exige un motivo');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3, reabierto_motivo = 'corto' WHERE trace_id = 't17-der'$q$, '23514', 'B02 el motivo de la reapertura debe tener 10 caracteres o mas');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 2, reabierto_motivo = 'Llegaron los datos pedidos' WHERE trace_id = 't17-der'$q$, '23514', 'B03 un archivado solo se reabre a EN_GESTION (no a CLASIFICADO)');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 6, reabierto_motivo = 'Llegaron los datos pedidos' WHERE trace_id = 't17-der'$q$, '23514', 'B04 un archivado solo se reabre a EN_GESTION (no a DERIVADO)');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 4, reabierto_motivo = 'Llegaron los datos pedidos' WHERE trace_id = 't17-der'$q$, '23514', 'B05 un archivado no vuelve a RESUELTO');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET reabierto_motivo = 'Motivo sin reabrir el caso' WHERE trace_id = 't17-der'$q$, '23514', 'B06 el motivo de reapertura solo se indica al reabrir');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3, reabierto_motivo = 'Llegaron los datos pedidos', reabierto_por = 'otro' WHERE trace_id = 't17-der'$q$, '23514', 'B07 quien reabrio lo llena la base');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3, reabierto_motivo = 'Llegaron los datos pedidos', reabierto_en = now() WHERE trace_id = 't17-der'$q$, '23514', 'B08 cuando se reabrio lo llena la base');
-- Un caso archivado desde REGISTRADO nunca tuvo area de destino: no hay a donde reabrirlo
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3, reabierto_motivo = 'Llegaron los datos pedidos' WHERE trace_id = 't17-reg'$q$, '23514', 'B09 reabrir exige area de destino (un archivado desde REGISTRADO no la tiene)');
-- El vencimiento tampoco reabre
SELECT set_config('app.actor', 'sistema:vencimiento', false);
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3, reabierto_motivo = 'Reabierto por el sistema' WHERE trace_id = 't17-neg'$q$, '23514', 'B10 un caso abierto no se reabre');

SELECT set_config('app.actor', 'usuario:rev-17', false);
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3, reabierto_motivo = 'Llegaron los datos pedidos' WHERE trace_id = 't17-der';
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3, reabierto_motivo = 'Si corresponde a este centro' WHERE trace_id = 't17-ges';
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3, reabierto_motivo = 'Se reactiva por pedido del paciente' WHERE trace_id = 't17-auto';
DO $$
DECLARE r chatbot.incidencia_paciente;
BEGIN
  SELECT * INTO r FROM chatbot.incidencia_paciente WHERE trace_id = 't17-der';
  ASSERT r.estado_incidencia_id = 3, 'B11 reabrir devuelve el caso a EN_GESTION';
  ASSERT r.archivado_en IS NULL AND r.motivo_archivo_id IS NULL AND r.archivo_detalle IS NULL, 'B12 al reabrir se limpian el archivado, el motivo y la justificacion';
  ASSERT r.reabierto_en IS NOT NULL AND r.reabierto_por = 'usuario:rev-17' AND r.reabierto_motivo = 'Llegaron los datos pedidos', 'B13 la base registra cuando, quien y por que se reabrio';
  ASSERT r.tomado_por = 'usuario:rev-17', 'B14 al reabrir el caso vuelve a estar tomado por quien lo reabrio';
  ASSERT (SELECT bool_and(estado_incidencia_id = 3 AND motivo_archivo_id IS NULL) FROM chatbot.incidencia_paciente WHERE trace_id IN ('t17-ges', 't17-auto')),
    'B15 se reabren los archivados por no corresponde y por vencimiento';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente_auditoria a JOIN chatbot.incidencia_paciente i ON i.id = a.incidencia_paciente_id
           WHERE i.trace_id = 't17-der' AND a.actor = 'usuario:rev-17' AND a.cambios ? 'reabierto_motivo' AND a.cambios -> 'archivo_detalle' ->> 'antes' = 'Faltan datos de contacto del paciente') = 1,
    'B16 el historial conserva la justificacion anterior y el motivo de la reapertura';
END $$;

-- Un caso archivado por la vigencia de su resolucion no se reabre
SELECT pg_temp.nuevo('t17-vig', 3);
SELECT pg_temp.llevar('t17-vig', 'RESUELTO');
ALTER TABLE chatbot.incidencia_paciente DISABLE TRIGGER USER;
UPDATE chatbot.incidencia_paciente SET resuelto_en = now() - interval '4 days' WHERE trace_id = 't17-vig';
ALTER TABLE chatbot.incidencia_paciente ENABLE TRIGGER USER;
SELECT chatbot.archivar_incidencias_resueltas(3, 1000);
SELECT set_config('app.actor', 'usuario:rev-17', false);
DO $$
BEGIN
  ASSERT (SELECT m.codigo FROM chatbot.incidencia_paciente i JOIN catalogo.motivo_archivo m ON m.id = i.motivo_archivo_id WHERE i.trace_id = 't17-vig') = 'RESUELTA_VIGENCIA', 'B17 el resuelto se archivo por vigencia';
END $$;
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3, reabierto_motivo = 'Se quiere volver a atender' WHERE trace_id = 't17-vig'$q$, '23514', 'B18 un archivado por vigencia de la resolucion nunca se reabre');

-- Un caso reabierto puede archivarse otra vez y reabrirse de nuevo
SELECT set_config('app.actor', 'usuario:rev-17b', false);
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 4, archivo_detalle = 'Tampoco corresponde, segunda vez' WHERE trace_id = 't17-ges';
DO $$
DECLARE r chatbot.incidencia_paciente;
BEGIN
  SELECT * INTO r FROM chatbot.incidencia_paciente WHERE trace_id = 't17-ges';
  ASSERT r.estado_incidencia_id = 7 AND r.archivo_detalle = 'Tampoco corresponde, segunda vez' AND r.archivado_en IS NOT NULL, 'B19 un caso reabierto se puede archivar otra vez';
  ASSERT r.reabierto_por = 'usuario:rev-17' AND r.reabierto_motivo = 'Si corresponde a este centro', 'B20 archivar de nuevo no borra el registro de la ultima reapertura';
END $$;
SELECT pg_sleep(0.05);
SELECT set_config('app.actor', 'usuario:rev-17c', false);
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3, reabierto_motivo = 'Segunda reapertura del caso' WHERE trace_id = 't17-ges';
DO $$
DECLARE r chatbot.incidencia_paciente;
BEGIN
  SELECT * INTO r FROM chatbot.incidencia_paciente WHERE trace_id = 't17-ges';
  ASSERT r.estado_incidencia_id = 3 AND r.reabierto_por = 'usuario:rev-17c' AND r.reabierto_motivo = 'Segunda reapertura del caso', 'B21 una segunda reapertura registra al ultimo que reabrio';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente_auditoria a JOIN chatbot.incidencia_paciente i ON i.id = a.incidencia_paciente_id
           WHERE i.trace_id = 't17-ges' AND a.operacion = 'ACTUALIZACION' AND a.cambios ? 'reabierto_motivo') = 2, 'B22 el historial guarda las dos reaperturas';
END $$;

-- El CHECK de la reapertura tambien rige con los disparadores apagados
ALTER TABLE chatbot.incidencia_paciente DISABLE TRIGGER USER;
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET reabierto_motivo = 'Motivo sin quien ni cuando' WHERE trace_id = 't17-chk3'$q$, '23514', 'B23 el motivo de reapertura sin quien ni cuando viola el CHECK');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET reabierto_en = now(), reabierto_por = 'x', reabierto_motivo = 'corto' WHERE trace_id = 't17-chk3'$q$, '23514', 'B24 un motivo de reapertura corto viola el CHECK');
ALTER TABLE chatbot.incidencia_paciente ENABLE TRIGGER USER;

-- El plazo de vencimiento de un caso reabierto cuenta desde la reapertura
DO $$
BEGIN
  ASSERT chatbot.archivar_incidencias_vencidas(3, 1000) = 0, 'B25 un caso recien reabierto no vuelve a vencer enseguida, aunque haya llegado hace mas de 3 dias';
END $$;
ALTER TABLE chatbot.incidencia_paciente DISABLE TRIGGER USER;
UPDATE chatbot.incidencia_paciente SET reabierto_en = now() - interval '4 days' WHERE trace_id = 't17-auto';
ALTER TABLE chatbot.incidencia_paciente ENABLE TRIGGER USER;
DO $$
BEGIN
  ASSERT chatbot.archivar_incidencias_vencidas(3, 1000) = 1, 'B26 pasado el plazo desde la reapertura, el caso vuelve a vencer';
  ASSERT (SELECT estado_incidencia_id = 7 FROM chatbot.incidencia_paciente WHERE trace_id = 't17-auto'), 'B26 queda archivado de nuevo';
END $$;

-- ===== Entrenamiento: los archivados a mano no entran =====
SELECT pg_temp.nuevo('t17-ent-di', 3);
SELECT pg_temp.nuevo('t17-ent-nc', 3);
SELECT pg_temp.nuevo('t17-ent-vig', 3);
SELECT pg_temp.nuevo('t17-ent-previo', 3);
SELECT pg_temp.llevar('t17-ent-di', 'DERIVADO');
SELECT pg_temp.llevar('t17-ent-nc', 'DERIVADO');
SELECT pg_temp.llevar('t17-ent-previo', 'DERIVADO');
SELECT set_config('app.actor', 'usuario:rev-17', false);
UPDATE chatbot.incidencia_paciente SET categoria_confirmada_en = now() WHERE trace_id IN ('t17-ent-di', 't17-ent-nc', 't17-ent-vig');
DO $$
BEGIN
  ASSERT pg_temp.apto('t17-ent-di') = 'true' AND pg_temp.apto('t17-ent-nc') = 'true', 'C01 la fila de entrenamiento nace apta';
END $$;

UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 3, archivo_detalle = 'Faltan datos para gestionar' WHERE trace_id = 't17-ent-di';
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 4, archivo_detalle = 'No corresponde a este centro' WHERE trace_id = 't17-ent-nc';
DO $$
BEGIN
  ASSERT pg_temp.apto('t17-ent-di') = 'false', 'C02 archivar por datos insuficientes saca el caso del entrenamiento';
  ASSERT pg_temp.apto('t17-ent-nc') = 'false', 'C03 archivar por no corresponde saca el caso del entrenamiento';
END $$;

UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3, reabierto_motivo = 'Llegaron los datos faltantes' WHERE trace_id = 't17-ent-di';
DO $$
BEGIN
  ASSERT pg_temp.apto('t17-ent-di') = 'true', 'C04 al reabrir el caso vuelve al entrenamiento';
  ASSERT pg_temp.apto('t17-ent-nc') = 'false', 'C05 los demas casos no se tocan';
END $$;
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 4, archivo_detalle = 'Ahora si es otro centro' WHERE trace_id = 't17-ent-di';
DO $$
BEGIN
  ASSERT pg_temp.apto('t17-ent-di') = 'false', 'C06 al archivarlo otra vez a mano sale de nuevo';
END $$;

-- Un archivado por vigencia o por vencimiento no cambia nada
SELECT pg_temp.llevar('t17-ent-vig', 'RESUELTO');
SELECT set_config('app.actor', 'usuario:rev-17', false);
ALTER TABLE chatbot.incidencia_paciente DISABLE TRIGGER USER;
UPDATE chatbot.incidencia_paciente SET resuelto_en = now() - interval '4 days' WHERE trace_id = 't17-ent-vig';
ALTER TABLE chatbot.incidencia_paciente ENABLE TRIGGER USER;
SELECT chatbot.archivar_incidencias_resueltas(3, 1000);
DO $$
BEGIN
  ASSERT (SELECT estado_incidencia_id = 7 FROM chatbot.incidencia_paciente WHERE trace_id = 't17-ent-vig') AND pg_temp.apto('t17-ent-vig') = 'true', 'C07 archivar por vigencia no saca el caso del entrenamiento';
END $$;

-- Si el caso ya esta archivado a mano cuando se revisa la categoria, la fila nace no apta
SELECT set_config('app.actor', 'usuario:rev-17', false);
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 3, archivo_detalle = 'Faltan datos para gestionar' WHERE trace_id = 't17-ent-previo';
UPDATE chatbot.incidencia_paciente SET categoria_confirmada_en = now() WHERE trace_id = 't17-ent-previo';
DO $$
BEGIN
  ASSERT pg_temp.apto('t17-ent-previo') = 'false', 'C08 la fila insertada para un caso ya archivado a mano nace no apta';
END $$;
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3, reabierto_motivo = 'Se retoma el caso del paciente' WHERE trace_id = 't17-ent-previo';
DO $$
BEGIN
  ASSERT pg_temp.apto('t17-ent-previo') = 'true', 'C09 al reabrirlo esa fila pasa a apta';
END $$;

-- apto_entrenamiento solo lo cambia la base; la tabla sigue siendo de solo insercion para lo demas
SELECT pg_temp.espera_error($q$UPDATE ia.entrenamiento_categoria SET apto_entrenamiento = false$q$, '23001', 'C10 nadie cambia apto_entrenamiento a mano');
SELECT pg_temp.espera_error($q$UPDATE ia.entrenamiento_categoria SET texto_entrenamiento = 'otro texto'$q$, '23001', 'C11 el texto de entrenamiento no se modifica');
SELECT pg_temp.espera_error($q$UPDATE ia.entrenamiento_categoria SET apto_entrenamiento = false, categoria_final_id = 4$q$, '23001', 'C12 tampoco junto con otro cambio');
SELECT pg_temp.espera_error($q$DELETE FROM ia.entrenamiento_categoria$q$, '23001', 'C13 las filas de entrenamiento no se borran');

TRUNCATE chatbot.archivo_recibido, chatbot.solicitud_carga, chatbot.evidencia, chatbot.incidencia_paciente_auditoria,
         ia.entrenamiento_categoria, chatbot.incidencia_analisis, chatbot.incidencia_paciente, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion;

\echo TODAS LAS PRUEBAS DE REVISION POR ESTABLECIMIENTO PASARON
