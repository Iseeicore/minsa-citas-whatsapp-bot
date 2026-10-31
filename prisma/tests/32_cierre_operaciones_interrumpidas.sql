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

CREATE FUNCTION pg_temp.evento(p_id text, p_operacion text, p_resultado text) RETURNS uuid
LANGUAGE sql AS $$
  SELECT auditoria.registrar_evento(jsonb_build_object(
    'id', p_id, 'operacion_id', p_operacion, 'origen', 'API', 'servicio', 'GESTION', 'modulo', 'incidencias',
    'accion', 'TOMAR', 'fase', 'EJECUCION', 'resultado', p_resultado, 'actor_tipo', 'USUARIO', 'actor_id', 'usuario:ana@minsa.gob.pe',
    'recurso_tipo', 'incidencia', 'recurso_id', 'MINSA-2026-000032'))
$$;

SELECT pg_temp.evento('32000000-0000-4000-8000-000000000011', '32000000-0000-4000-8000-000000000001', 'INICIADO');
SELECT pg_temp.evento('32000000-0000-4000-8000-000000000021', '32000000-0000-4000-8000-000000000002', 'INICIADO');
SELECT pg_temp.evento('32000000-0000-4000-8000-000000000022', '32000000-0000-4000-8000-000000000002', 'COMPLETADO');
SELECT pg_sleep(0.3);
SELECT pg_temp.evento('32000000-0000-4000-8000-000000000031', '32000000-0000-4000-8000-000000000003', 'INICIADO');

DO $$
BEGIN
  ASSERT auditoria.cerrar_operaciones_interrumpidas(interval '0.2 seconds') >= 1,
    'I01 se cierran las operaciones iniciadas, sin cierre y mas antiguas que la antiguedad indicada';
  ASSERT (SELECT count(*) FROM auditoria.evento
           WHERE operacion_id = '32000000-0000-4000-8000-000000000001' AND resultado = 'INTERRUMPIDO'
             AND evento_padre_id = '32000000-0000-4000-8000-000000000011' AND actor_tipo = 'SISTEMA'
             AND motivo_codigo = 'SIN_CIERRE' AND fase = 'EJECUCION' AND octet_length(huella_contenido) = 32) = 1,
    'I02 el cierre es un evento nuevo de la misma operacion, hijo del evento iniciado';
  ASSERT (SELECT count(*) FROM auditoria.evento WHERE operacion_id = '32000000-0000-4000-8000-000000000002') = 2
     AND (SELECT count(*) FROM auditoria.evento WHERE operacion_id = '32000000-0000-4000-8000-000000000003') = 1,
    'I03 una operacion completada y una reciente quedan como estaban';
  ASSERT auditoria.cerrar_operaciones_interrumpidas(interval '0.2 seconds') = 0,
    'I04 repetir el cierre no cierra dos veces la misma operacion';
END $$;

SELECT pg_temp.espera_error($q$SELECT auditoria.cerrar_operaciones_interrumpidas(interval '0 seconds')$q$, '22023', 'I05 la antiguedad debe ser positiva');
SELECT pg_temp.espera_error($q$SELECT auditoria.cerrar_operaciones_interrumpidas(interval '1 hour', 0)$q$, '22023', 'I06 el lote debe ser positivo');

\echo TODAS LAS PRUEBAS DEL CIERRE DE OPERACIONES INTERRUMPIDAS PASARON
