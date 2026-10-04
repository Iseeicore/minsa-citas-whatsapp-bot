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

SELECT set_config('app.actor', 'ciudadano:wa-estados', false);
INSERT INTO chatbot.usuario (wa_id) VALUES ('wa-estados');
INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id)
SELECT 1, id, 'wa-estados', true, 'Incidencia ' || t, 'trace-estados-' || t FROM chatbot.usuario, unnest(ARRAY['A', 'B', 'C', 'D']) AS t
 WHERE wa_id = 'wa-estados';

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'trace-estados-%' AND estado_incidencia_id = 1) = 4,
    'E01 toda incidencia nace REGISTRADA';
END $$;

-- La IA clasifica: la base pasa la incidencia a CLASIFICADO sin que la aplicacion lo pida.
SELECT set_config('app.actor', 'sistema:ia', false);
UPDATE chatbot.incidencia_paciente SET categoria_ia_id = 2, categoria_confianza = 80, version_clasificador = 'v1'
 WHERE trace_id IN ('trace-estados-A', 'trace-estados-C');
DO $$
BEGIN
  ASSERT (SELECT estado_incidencia_id FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-estados-A') = 2, 'E02 al asignar la categoria pasa a CLASIFICADO';
  ASSERT (SELECT estado_incidencia_id FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-estados-B') = 1, 'E02 sin categoria sigue REGISTRADA';
END $$;

-- Sin categoria de la IA no se puede estar clasificada, derivada ni en gestion.
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 2 WHERE trace_id = 'trace-estados-B'$q$, '23514', 'E03 CLASIFICADO exige categoria de la IA');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3 WHERE trace_id = 'trace-estados-B'$q$, '23514', 'E04 no se salta a EN_GESTION desde REGISTRADO');

-- Recorrido: CLASIFICADO -> DERIVADO -> EN_GESTION.
SELECT set_config('app.actor', 'operador:gestor', false);
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 6 WHERE trace_id = 'trace-estados-A';
DO $$
BEGIN
  ASSERT (SELECT estado_incidencia_id FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-estados-A') = 6, 'E05 se deriva al area competente';
END $$;
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3 WHERE trace_id = 'trace-estados-A';

-- Corregir la categoria despues de derivar no cambia el estado.
UPDATE chatbot.incidencia_paciente SET categoria_id = 3 WHERE trace_id = 'trace-estados-C';
DO $$
BEGIN
  ASSERT (SELECT estado_incidencia_id FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-estados-C') = 2, 'E06 corregir la categoria no cambia el estado';
END $$;

-- Transiciones no permitidas.
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 2 WHERE trace_id = 'trace-estados-A'$q$, '23514', 'E07 no se retrocede de EN_GESTION a CLASIFICADO');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 7 WHERE trace_id = 'trace-estados-C'$q$, '23514', 'E08 ARCHIVADO solo desde RESUELTO');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 4 WHERE trace_id = 'trace-estados-C'$q$, '23514', 'E09 RESUELTO exige registrar la resolucion');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 5 WHERE trace_id = 'trace-estados-C'$q$, '23514', 'E10 ANULADO ya no es un destino valido');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET resolucion = 'ok', estado_incidencia_id = 6 WHERE trace_id = 'trace-estados-C'$q$, '23514', 'E11 al resolver el estado solo puede ser RESUELTO');

-- Registrar la resolucion la pasa a RESUELTO; tambien se puede resolver sin haber pasado por la IA.
UPDATE chatbot.incidencia_paciente SET resolucion = 'Se atendio el reclamo' WHERE trace_id = 'trace-estados-A';
UPDATE chatbot.incidencia_paciente SET resolucion = 'Resuelta sin IA' WHERE trace_id = 'trace-estados-B';
DO $$
DECLARE r chatbot.incidencia_paciente;
BEGIN
  SELECT * INTO r FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-estados-A';
  ASSERT r.estado_incidencia_id = 4 AND r.resuelto_en IS NOT NULL AND r.resuelto_por = 'operador:gestor', 'E12 al registrar la resolucion pasa a RESUELTO';
  ASSERT (SELECT estado_incidencia_id FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-estados-B') = 4, 'E13 se puede resolver sin categoria de la IA';
END $$;

-- Archivado automatico a los 3 dias.
DO $$
BEGIN
  ASSERT chatbot.purgar_sesiones_inactivas() = 0, 'E14 la purga de sesiones no toca incidencias';
  ASSERT chatbot.archivar_incidencias_resueltas() = 0, 'E14 las recien resueltas no se archivan';
END $$;

ALTER TABLE chatbot.incidencia_paciente DISABLE TRIGGER trg_incidencia_paciente_a_reglas;
UPDATE chatbot.incidencia_paciente SET resuelto_en = now() - interval '4 days' WHERE trace_id = 'trace-estados-A';
UPDATE chatbot.incidencia_paciente SET resuelto_en = now() - interval '2 days' WHERE trace_id = 'trace-estados-B';
ALTER TABLE chatbot.incidencia_paciente ENABLE TRIGGER trg_incidencia_paciente_a_reglas;

DO $$
BEGIN
  ASSERT chatbot.archivar_incidencias_resueltas(3, 1000) = 1, 'E15 se archiva solo la resuelta hace mas de 3 dias';
  ASSERT (SELECT estado_incidencia_id FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-estados-A') = 7, 'E15 queda ARCHIVADA';
  ASSERT (SELECT estado_incidencia_id FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-estados-B') = 4, 'E15 la de 2 dias sigue RESUELTA';
  ASSERT (SELECT usuario_modificacion FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-estados-A') = 'sistema:archivado', 'E16 la base firma al archivador';
  ASSERT EXISTS (SELECT 1 FROM chatbot.incidencia_paciente_auditoria a JOIN chatbot.incidencia_paciente i ON i.id = a.incidencia_paciente_id
                  WHERE i.trace_id = 'trace-estados-A' AND a.actor = 'sistema:archivado' AND a.cambios ? 'estado_incidencia_id'),
    'E17 el historial guarda el archivado con su actor';
  ASSERT chatbot.archivar_incidencias_resueltas() = 0, 'E18 no hay mas que archivar';
END $$;

SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 4 WHERE trace_id = 'trace-estados-A'$q$, '23514', 'E19 una archivada no vuelve atras');
SELECT pg_temp.espera_error($q$SELECT chatbot.archivar_incidencias_resueltas(0, 10)$q$, '23514', 'E20 los dias deben ser al menos 1');
SELECT pg_temp.espera_error($q$SELECT chatbot.archivar_incidencias_resueltas(3, 0)$q$, '23514', 'E21 el lote debe ser al menos 1');

-- Anular es el borrado logico: la incidencia queda inactiva y el archivado la ignora.
UPDATE chatbot.incidencia_paciente SET activo = false, eliminado_en = now(), eliminado_por = 'operador:gestor' WHERE trace_id = 'trace-estados-D';
DO $$
BEGIN
  ASSERT (SELECT NOT activo FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-estados-D'), 'E22 anular es el borrado logico';
END $$;
SELECT pg_temp.espera_error($q$DELETE FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-estados-D'$q$, '23001', 'E23 la incidencia no se borra fisicamente');

TRUNCATE chatbot.archivo_recibido, chatbot.solicitud_carga, chatbot.evidencia, chatbot.incidencia_paciente_auditoria,
         ia.entrenamiento_categoria, chatbot.incidencia_paciente, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion;

\echo TODAS LAS PRUEBAS DE ESTADOS PASARON
