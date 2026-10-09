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
INSERT INTO catalogo.area (codigo, nombre, tipo_area_id) VALUES ('T09-AREA', 'Area de prueba 09', 1);

CREATE TEMP TABLE edades (traza text PRIMARY KEY, horas integer NOT NULL);

CREATE FUNCTION pg_temp.crear(p_traza text, p_estado text, p_horas integer) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_usuario uuid;
  v_id uuid;
BEGIN
  PERFORM set_config('app.actor', 'ciudadano:venc', false);
  INSERT INTO chatbot.usuario (wa_id) VALUES ('wa-' || p_traza) RETURNING id INTO v_usuario;
  INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id)
  VALUES (1, v_usuario, 'wa-' || p_traza, true, 'Incidencia ' || p_traza, p_traza)
  RETURNING id INTO v_id;
  INSERT INTO edades VALUES (p_traza, p_horas);

  IF p_estado <> 'REGISTRADO' THEN
    PERFORM set_config('app.actor', 'sistema:ia', false);
    UPDATE chatbot.incidencia_paciente SET categoria_ia_id = 3, categoria_confianza = 80, version_clasificador = 'v1' WHERE id = v_id;
  END IF;
  IF p_estado IN ('DERIVADO', 'EN_GESTION', 'RESUELTO') THEN
    PERFORM set_config('app.actor', 'operador:gestor', false);
    UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 6, area_destino_id = (SELECT id FROM catalogo.area WHERE codigo = 'T09-AREA') WHERE id = v_id;
  END IF;
  IF p_estado IN ('EN_GESTION', 'RESUELTO') THEN
    PERFORM set_config('app.actor', 'operador:area', false);
    UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3 WHERE id = v_id;
  END IF;
  IF p_estado = 'RESUELTO' THEN
    UPDATE chatbot.incidencia_paciente SET medidas_tomadas = 'Se atendio el caso', fundamento = 'Caso procedente', resultado_resolucion_id = 1 WHERE id = v_id;
  END IF;
END;
$$;

SELECT pg_temp.crear('venc-A', 'REGISTRADO', 100);
SELECT pg_temp.crear('venc-B', 'CLASIFICADO', 100);
SELECT pg_temp.crear('venc-C', 'DERIVADO', 100);
SELECT pg_temp.crear('venc-D', 'EN_GESTION', 100);
SELECT pg_temp.crear('venc-E', 'RESUELTO', 100);
SELECT pg_temp.crear('venc-F', 'CLASIFICADO', 10);
SELECT pg_temp.crear('venc-G', 'CLASIFICADO', 100);
SELECT pg_temp.crear('venc-H', 'CLASIFICADO', 73);
SELECT pg_temp.crear('venc-I', 'CLASIFICADO', 71);

SELECT set_config('app.actor', 'operador:gestor', false);
UPDATE chatbot.incidencia_paciente SET activo = false, eliminado_en = now(), eliminado_por = 'operador:gestor' WHERE trace_id = 'venc-G';

ALTER TABLE chatbot.incidencia_paciente DISABLE TRIGGER USER;
UPDATE chatbot.incidencia_paciente i SET fecha_creacion = now() - make_interval(hours => e.horas) FROM edades e WHERE i.trace_id = e.traza;
ALTER TABLE chatbot.incidencia_paciente ENABLE TRIGGER USER;

SELECT set_config('app.actor', 'operador:gestor', false);
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 2 WHERE trace_id = 'venc-B'$q$, '23514', 'V01 un gestor no archiva un caso clasificado como vencido');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7, motivo_archivo_id = 2 WHERE trace_id = 'venc-A'$q$, '23514', 'V02 un gestor no archiva un caso registrado como vencido');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7 WHERE trace_id = 'venc-A'$q$, '23514', 'V02b archivar exige un motivo');
SELECT set_config('app.actor', 'sistema:archivado', false);
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7 WHERE trace_id = 'venc-C'$q$, '23514', 'V03 el archivador de resueltas no archiva casos abiertos');

SELECT pg_temp.espera_error($q$SELECT chatbot.archivar_incidencias_vencidas(0, 10)$q$, '23514', 'V04 los dias deben ser al menos 1');
SELECT pg_temp.espera_error($q$SELECT chatbot.archivar_incidencias_vencidas(3, 0)$q$, '23514', 'V05 el lote debe ser al menos 1');
SELECT pg_temp.espera_error($q$SELECT chatbot.archivar_incidencias_vencidas(NULL, 10)$q$, '23514', 'V06 los dias son obligatorios');

DO $$
BEGIN
  ASSERT chatbot.archivar_incidencias_vencidas(5, 1000) = 0, 'V07 con un plazo mayor no se archiva lo que aun no vencio';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'venc-%' AND estado_incidencia_id = 7) = 0, 'V08 nada quedo archivado';

  ASSERT chatbot.archivar_incidencias_vencidas(3, 1) = 1, 'V09 con lote 1 se archiva una sola';
END $$;

DO $$
BEGIN
  ASSERT chatbot.archivar_incidencias_vencidas(3, 1000) = 4, 'V10 se archivan las abiertas restantes que vencieron';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id IN ('venc-A', 'venc-B', 'venc-C', 'venc-D', 'venc-H') AND estado_incidencia_id = 7) = 5,
    'V11 las cinco abiertas vencidas quedan ARCHIVADAS';

  ASSERT (SELECT estado_incidencia_id FROM chatbot.incidencia_paciente WHERE trace_id = 'venc-F') = 2, 'V12 la de 10 horas sigue CLASIFICADA';
  ASSERT (SELECT estado_incidencia_id FROM chatbot.incidencia_paciente WHERE trace_id = 'venc-I') = 2, 'V13 la de 71 horas sigue CLASIFICADA';
  ASSERT (SELECT estado_incidencia_id FROM chatbot.incidencia_paciente WHERE trace_id = 'venc-E') = 4, 'V14 la resuelta no se archiva por vencimiento';
  ASSERT (SELECT estado_incidencia_id FROM chatbot.incidencia_paciente WHERE trace_id = 'venc-G') = 2, 'V15 la anulada (inactiva) no se archiva';

  ASSERT chatbot.archivar_incidencias_vencidas(3, 1000) = 0, 'V16 no hay mas que archivar';

  ASSERT (SELECT usuario_modificacion FROM chatbot.incidencia_paciente WHERE trace_id = 'venc-B') = 'sistema:vencimiento', 'V17 la base firma el vencimiento';
  ASSERT (SELECT count(DISTINCT a.incidencia_paciente_id) FROM chatbot.incidencia_paciente_auditoria a JOIN chatbot.incidencia_paciente i ON i.id = a.incidencia_paciente_id
           WHERE i.trace_id LIKE 'venc-%' AND a.actor = 'sistema:vencimiento' AND a.cambios ? 'estado_incidencia_id') = 5,
    'V18 el historial guarda el archivado por vencimiento de las cinco';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'venc-%' AND estado_incidencia_id = 7 AND medidas_tomadas IS NULL) = 5,
    'V19 un archivado por vencimiento se reconoce porque nunca tuvo resolucion';

  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente i JOIN catalogo.motivo_archivo m ON m.id = i.motivo_archivo_id
           WHERE i.trace_id LIKE 'venc-%' AND m.codigo = 'VENCIDA_SIN_ATENDER' AND i.archivado_en IS NOT NULL) = 5,
    'V19b la base deduce el motivo VENCIDA_SIN_ATENDER y la fecha de archivado';

  ASSERT chatbot.archivar_incidencias_resueltas(3, 1000) = 0, 'V20 las resueltas recientes no se archivan';
END $$;

SELECT set_config('app.actor', 'operador:gestor', false);
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3 WHERE trace_id = 'venc-B'$q$, '23514', 'V21 un archivado por vencimiento no se reabre sin motivo');

TRUNCATE chatbot.archivo_recibido, chatbot.solicitud_carga, chatbot.evidencia, chatbot.incidencia_paciente_auditoria,
         ia.entrenamiento_categoria, chatbot.incidencia_analisis, chatbot.incidencia_paciente, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion;

\echo TODAS LAS PRUEBAS DE ARCHIVADO POR VENCIMIENTO PASARON
