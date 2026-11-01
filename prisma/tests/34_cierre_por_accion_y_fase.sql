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

CREATE FUNCTION pg_temp.operacion(p_numero integer) RETURNS uuid
LANGUAGE sql AS $$
  SELECT ('34000000-0000-4000-9000-' || lpad(p_numero::text, 12, '0'))::uuid
$$;

DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = to_regprocedure('auditoria.cerrar_operaciones_interrumpidas(interval,integer)')
       AND p.prosecdef AND p.prorettype = 'integer'::regtype
       AND 'search_path=pg_catalog' = ANY(p.proconfig)
       AND p.pronargdefaults = 1
       AND pg_get_function_arguments(p.oid) LIKE '%DEFAULT 1000%'
  ), 'P01 la firma, el definidor, el search_path y el lote por defecto no cambian';
END $$;

BEGIN;

INSERT INTO auditoria.evento (
  id, operacion_id, ocurrido_en, registrado_en, origen, servicio, modulo,
  accion, fase, resultado, actor_tipo, actor_id, huella_contenido
)
SELECT
  ('34000000-0000-4000-8000-' || lpad(evento::text, 12, '0'))::uuid, pg_temp.operacion(operacion),
  now() - antiguedad, now() - antiguedad, 'PRUEBA', 'GESTION', 'CASOS',
  accion, fase, resultado, 'SISTEMA', 'prueba:cierre', sha256(convert_to(evento::text, 'UTF8'))
FROM (VALUES
  (1, 1, 'TOMAR', 'SOLICITUD', 'INICIADO', interval '2 hours'),
  (2, 1, 'TRANSACCION_BD', 'EJECUCION', 'COMPLETADO', interval '2 hours'),
  (3, 1, 'TOMAR', 'ENTREGA', 'INICIADO', interval '2 hours'),
  (4, 2, 'TOMAR', 'SOLICITUD', 'INICIADO', interval '2 hours'),
  (5, 2, 'TOMAR', 'ENTREGA', 'INICIADO', interval '2 hours'),
  (6, 2, 'TOMAR', 'ENTREGA', 'COMPLETADO', interval '2 hours'),
  (7, 3, 'TOMAR', 'SOLICITUD', 'INICIADO', interval '10 minutes'),
  (8, 4, 'TOMAR', 'SOLICITUD', 'INICIADO', interval '2 hours'),
  (9, 4, 'TOMAR', 'AUTORIZACION', 'DENEGADO', interval '2 hours'),
  (10, 5, 'TOMAR', 'SOLICITUD', 'INICIADO', interval '2 hours'),
  (11, 5, 'TOMAR', 'AUTORIZACION', 'DENEGADO', interval '2 hours'),
  (12, 5, 'TOMAR', 'OBSERVACION', 'DENEGADO', interval '2 hours'),
  (13, 5, 'TOMAR', 'ENTREGA', 'COMPLETADO', interval '2 hours'),
  (14, 6, 'INTERNA', 'EJECUCION', 'INICIADO', interval '2 hours'),
  (15, 6, 'INTERNA', 'EJECUCION', 'COMPLETADO', interval '2 hours'),
  (16, 7, 'INTERNA', 'EJECUCION', 'INICIADO', interval '2 hours'),
  (17, 8, 'CANAL_EVENTOS', 'SOLICITUD', 'INICIADO', interval '2 hours'),
  (18, 8, 'CANAL_EVENTOS', 'ENTREGA', 'INICIADO', interval '2 hours'),
  (19, 9, 'TOMAR', 'SOLICITUD', 'INICIADO', interval '2 hours'),
  (20, 9, 'TOMAR', 'ENTREGA', 'INTERRUMPIDO', interval '2 hours'),
  (21, 10, 'TOMAR', 'SOLICITUD', 'INICIADO', interval '2 hours'),
  (22, 10, 'OTRA_ACCION', 'ENTREGA', 'COMPLETADO', interval '2 hours'),
  (23, 11, 'TOMAR', 'SOLICITUD', 'INICIADO', interval '2 hours'),
  (24, 11, 'TOMAR', 'EJECUCION', 'COMPLETADO', interval '2 hours'),
  (25, 12, 'INTERNA', 'EJECUCION', 'INICIADO', interval '2 hours'),
  (26, 12, 'INTERNA', 'EJECUCION', 'DENEGADO', interval '2 hours'),
  (27, 13, 'TOMAR', 'SOLICITUD', 'INICIADO', interval '2 hours'),
  (28, 14, 'INTERNA', 'EJECUCION', 'INICIADO', interval '2 hours'),
  (29, 14, 'INTERNA', 'EJECUCION', 'FALLIDO', interval '2 hours')
) AS datos(evento, operacion, accion, fase, resultado, antiguedad);

SELECT auditoria.cerrar_operaciones_interrumpidas(interval '1 hour', 100);

DO $$
DECLARE
  numero integer;
BEGIN
  ASSERT (SELECT count(*) FROM auditoria.evento
           WHERE operacion_id = pg_temp.operacion(1) AND accion = 'TOMAR' AND fase = 'ENTREGA'
             AND resultado = 'INTERRUMPIDO' AND motivo_codigo = 'SIN_CIERRE'
             AND evento_padre_id = '34000000-0000-4000-8000-000000000001') = 1,
    'P02 el commit de la transaccion no cierra la solicitud HTTP: se cierra en ENTREGA, hijo del primer evento iniciado';

  FOREACH numero IN ARRAY ARRAY[4, 10, 11, 13] LOOP
    ASSERT (SELECT count(*) FROM auditoria.evento
             WHERE operacion_id = pg_temp.operacion(numero) AND accion = 'TOMAR' AND fase = 'ENTREGA'
               AND resultado = 'INTERRUMPIDO' AND motivo_codigo = 'SIN_CIERRE') = 1,
      format('P03 sin entrega final, ni una autorizacion denegada, ni la ejecucion, ni otra accion cierran la solicitud (operacion %s)', numero);
  END LOOP;

  ASSERT (SELECT count(*) FROM auditoria.evento
           WHERE operacion_id = pg_temp.operacion(7) AND accion = 'INTERNA' AND fase = 'EJECUCION'
             AND resultado = 'INTERRUMPIDO' AND motivo_codigo = 'SIN_CIERRE') = 1,
    'P04 una ejecucion interna sin cierre se cierra en su propia fase';

  FOREACH numero IN ARRAY ARRAY[2, 3, 5, 6, 8, 9, 12, 14] LOOP
    ASSERT NOT EXISTS (SELECT 1 FROM auditoria.evento WHERE operacion_id = pg_temp.operacion(numero) AND motivo_codigo = 'SIN_CIERRE'),
      format('P05 no se cierran entregas terminadas, solicitudes recientes, canales en vivo ni ejecuciones terminadas (operacion %s)', numero);
  END LOOP;

  ASSERT auditoria.cerrar_operaciones_interrumpidas(interval '1 hour') = 0,
    'P06 repetir el cierre, con el lote por defecto, no cierra dos veces';
  ASSERT (SELECT count(*) FROM auditoria.evento WHERE operacion_id::text LIKE '34000000-0000-4000-9000-%' AND motivo_codigo = 'SIN_CIERRE') = 6,
    'P07 solo las seis acciones antiguas y sin cierre reciben evidencia';
  ASSERT (SELECT resultado FROM auditoria.evento WHERE id = '34000000-0000-4000-8000-000000000002') = 'COMPLETADO',
    'P08 el cierre no modifica la evidencia del commit';
END $$;

INSERT INTO auditoria.evento (
  id, operacion_id, ocurrido_en, registrado_en, origen, servicio, modulo,
  accion, fase, resultado, actor_tipo, actor_id, huella_contenido
)
SELECT
  ('34000000-0000-4000-8000-' || lpad(evento::text, 12, '0'))::uuid, pg_temp.operacion(operacion),
  now() - interval '2 hours', now() - interval '2 hours', 'PRUEBA', 'GESTION', 'CASOS',
  'INTERNA', 'EJECUCION', 'INICIADO', 'SISTEMA', 'prueba:cierre', sha256(convert_to(evento::text, 'UTF8'))
FROM (VALUES (101, 21), (102, 22)) AS datos(evento, operacion);

DO $$
BEGIN
  ASSERT auditoria.cerrar_operaciones_interrumpidas(interval '1 hour', 1) = 1, 'P09 el primer lote respeta su limite';
  ASSERT auditoria.cerrar_operaciones_interrumpidas(interval '1 hour', 1) = 1, 'P10 el lote siguiente atiende la otra accion';
  ASSERT auditoria.cerrar_operaciones_interrumpidas(interval '1 hour', 1) = 0, 'P11 cada accion queda cerrada una sola vez';
END $$;

INSERT INTO auditoria.evento (
  id, operacion_id, evento_padre_id, ocurrido_en, origen, servicio, modulo,
  accion, fase, resultado, actor_tipo, actor_id, huella_contenido
) VALUES (
  '34000000-0000-4000-8000-000000000201', pg_temp.operacion(1), '34000000-0000-4000-8000-000000000003', now(),
  'PRUEBA', 'GESTION', 'CASOS', 'TOMAR', 'ENTREGA', 'COMPLETADO', 'SISTEMA', 'prueba:cierre', sha256(convert_to('cierre-tardio', 'UTF8'))
);

DO $$
BEGIN
  ASSERT auditoria.cerrar_operaciones_interrumpidas(interval '1 hour', 100) = 0,
    'P12 una entrega tardia no provoca otro cierre';
  ASSERT (SELECT count(*) FROM auditoria.evento
           WHERE operacion_id = pg_temp.operacion(1) AND fase = 'ENTREGA'
             AND (motivo_codigo = 'SIN_CIERRE' OR id = '34000000-0000-4000-8000-000000000201')) = 2,
    'P13 el cierre inferido y la entrega tardia quedan como dos hechos separados';
END $$;

ROLLBACK;

SELECT pg_temp.espera_error($q$SELECT auditoria.cerrar_operaciones_interrumpidas(NULL::interval, 100)$q$, '22023', 'P14 la antiguedad es obligatoria');
SELECT pg_temp.espera_error($q$SELECT auditoria.cerrar_operaciones_interrumpidas(interval '-1 second', 100)$q$, '22023', 'P15 la antiguedad no puede ser negativa');
SELECT pg_temp.espera_error($q$SELECT auditoria.cerrar_operaciones_interrumpidas(interval '1 hour', NULL::integer)$q$, '22023', 'P16 el lote es obligatorio');

\echo TODAS LAS PRUEBAS DEL CIERRE POR ACCION Y FASE PASARON
