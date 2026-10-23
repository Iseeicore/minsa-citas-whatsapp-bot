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

-- Referencia independiente de la funcion: el n-esimo dia de lunes a viernes despues de la fecha p_dia, contado dia por dia.
CREATE FUNCTION pg_temp.habil_n(p_dia date, p_n integer) RETURNS date
LANGUAGE sql AS $$
  SELECT g::date
    FROM generate_series(p_dia + 1, p_dia + p_n * 2 + 10, interval '1 day') g
   WHERE extract(isodow FROM g) < 6
   ORDER BY g
  OFFSET p_n - 1 LIMIT 1
$$;

CREATE FUNCTION pg_temp.lima(p_texto text) RETURNS timestamptz
LANGUAGE sql AS $$ SELECT p_texto::timestamp AT TIME ZONE 'America/Lima' $$;

DO $$
BEGIN
  ASSERT (SELECT string_agg(codigo || '=' || plazo_dias_habiles || '/' || archiva_por_vencimiento, ',' ORDER BY id) FROM catalogo.categoria_incidencia)
         = 'DENUNCIA_CORRUPCION=3/false,QUEJA=30/true,RECLAMO=30/true,OTRO=30/true',
    'H01 cada categoria tiene su plazo en dias habiles y si se archiva por vencimiento';
  ASSERT (SELECT provolatile FROM pg_proc WHERE oid = 'catalogo.sumar_dias_habiles(timestamptz, integer)'::regprocedure) = 'i',
    'H02 la suma de dias habiles es inmutable';
  ASSERT obj_description('catalogo.sumar_dias_habiles(timestamptz, integer)'::regprocedure, 'pg_proc') IS NOT NULL,
    'H03 la suma de dias habiles tiene descripcion';

  ASSERT extract(isodow FROM date '2026-10-23') = 5 AND extract(isodow FROM date '2026-10-21') = 3, 'H04 el 23/10/2026 es viernes y el 21/10/2026 es miercoles';

  ASSERT catalogo.sumar_dias_habiles(pg_temp.lima('2026-10-23 10:00'), 1) = pg_temp.lima('2026-10-27 00:00'),
    'H05 desde un viernes, 1 dia habil es el lunes: vence al terminar el lunes';
  ASSERT catalogo.sumar_dias_habiles(pg_temp.lima('2026-10-23 10:00'), 3) = pg_temp.lima('2026-10-29 00:00'),
    'H06 desde un viernes, 3 dias habiles terminan el miercoles';
  ASSERT catalogo.sumar_dias_habiles(pg_temp.lima('2026-10-24 09:00'), 1) = pg_temp.lima('2026-10-27 00:00')
     AND catalogo.sumar_dias_habiles(pg_temp.lima('2026-10-25 18:00'), 1) = pg_temp.lima('2026-10-27 00:00'),
    'H07 desde un sabado o un domingo, el primer dia habil es el lunes';
  ASSERT catalogo.sumar_dias_habiles(pg_temp.lima('2026-10-24 09:00'), 3) = pg_temp.lima('2026-10-29 00:00'),
    'H08 desde un sabado, 3 dias habiles terminan el miercoles';
  ASSERT catalogo.sumar_dias_habiles(pg_temp.lima('2026-10-21 08:00'), 3) = pg_temp.lima('2026-10-27 00:00'),
    'H09 desde un miercoles, 3 dias habiles cruzan el fin de semana y terminan el lunes';
  ASSERT catalogo.sumar_dias_habiles(pg_temp.lima('2026-10-21 08:00'), 30) = pg_temp.lima('2026-12-03 00:00'),
    'H10 desde un miercoles, 30 dias habiles (seis semanas) terminan el miercoles 2/12';
  ASSERT catalogo.sumar_dias_habiles(pg_temp.lima('2026-10-24 08:00'), 30) = pg_temp.lima('2026-12-05 00:00'),
    'H11 desde un sabado, 30 dias habiles terminan el viernes 4/12';

  ASSERT catalogo.sumar_dias_habiles('2026-10-27 02:00+00', 1) = '2026-10-28 05:00+00',
    'H12 las 02:00 UTC del martes son las 21:00 del lunes en Lima: se cuenta desde el lunes';
  ASSERT catalogo.sumar_dias_habiles('2026-10-24 03:00+00', 0) = '2026-10-24 05:00+00',
    'H13 con 0 dias vence al terminar el mismo dia de Lima (viernes), aunque en UTC ya sea sabado';
  ASSERT (SELECT bool_and((catalogo.sumar_dias_habiles(pg_temp.lima('2026-10-19 13:00') + make_interval(days => d), 7) AT TIME ZONE 'America/Lima')::time = '00:00')
            FROM generate_series(0, 6) d),
    'H14 el plazo siempre vence a medianoche de Lima';
  ASSERT catalogo.sumar_dias_habiles(NULL, 3) IS NULL AND catalogo.sumar_dias_habiles(now(), NULL) IS NULL, 'H15 con un argumento nulo devuelve nulo';

  ASSERT (SELECT count(*)
            FROM generate_series(date '2026-10-17', date '2026-10-30', interval '1 day') d,
                 unnest(ARRAY[1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 14, 15, 29, 30, 31]) n
           WHERE catalogo.sumar_dias_habiles(pg_temp.lima(d::date || ' 12:00'), n)
                 <> pg_temp.lima((pg_temp.habil_n(d::date, n) + 1) || ' 00:00')) = 0,
    'H16 coincide con contar dia por dia para cualquier dia de la semana y varios plazos';
END $$;

SELECT pg_temp.espera_error($q$SELECT catalogo.sumar_dias_habiles(now(), -1)$q$, '23514', 'H17 los dias negativos se rechazan');

SELECT set_config('app.actor', 'sistema:prueba', false);
INSERT INTO catalogo.area (codigo, nombre, tipo_area_id) VALUES ('T22-AREA', 'Area de prueba 22', 1);

CREATE FUNCTION pg_temp.crear(p_traza text, p_categoria integer, p_estado text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_usuario uuid;
BEGIN
  PERFORM set_config('app.actor', 'ciudadano:' || p_traza, false);
  INSERT INTO chatbot.usuario (wa_id) VALUES ('wa-' || p_traza) RETURNING id INTO v_usuario;
  INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id)
  VALUES (1, v_usuario, 'wa-' || p_traza, true, 'Incidencia ' || p_traza, p_traza);
  IF p_categoria IS NOT NULL THEN
    PERFORM set_config('app.actor', 'sistema:ia', false);
    UPDATE chatbot.incidencia_paciente SET categoria_ia_id = p_categoria, categoria_confianza = 80, version_clasificador = 'v1' WHERE trace_id = p_traza;
  END IF;
  IF p_estado = 'DERIVADO' THEN
    PERFORM set_config('app.actor', 'usuario:gestor-22', false);
    UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 6, area_destino_id = (SELECT id FROM catalogo.area WHERE codigo = 'T22-AREA') WHERE trace_id = p_traza;
  END IF;
END;
$$;

-- Fechas de Lima calculadas dia por dia (sin la funcion): el ultimo dia cuyo plazo de 30 dias habiles termino antes de hoy, y el siguiente.
CREATE TEMP TABLE limite AS
SELECT max(d::date) AS vencido, max(d::date) + 1 AS por_vencer
  FROM generate_series((now() AT TIME ZONE 'America/Lima')::date - 80, (now() AT TIME ZONE 'America/Lima')::date, interval '1 day') d
 WHERE pg_temp.habil_n(d::date, 30) < (now() AT TIME ZONE 'America/Lima')::date;

SELECT pg_temp.crear('t22-corrupcion', 1, 'CLASIFICADO');
SELECT pg_temp.crear('t22-reclamo-vencido', 3, 'CLASIFICADO');
SELECT pg_temp.crear('t22-reclamo-por-vencer', 3, 'CLASIFICADO');
SELECT pg_temp.crear('t22-queja-vieja', 2, 'DERIVADO');
SELECT pg_temp.crear('t22-sin-categoria', NULL, 'REGISTRADO');
SELECT pg_temp.crear('t22-reabierto', 3, 'DERIVADO');

ALTER TABLE chatbot.incidencia_paciente DISABLE TRIGGER USER;
UPDATE chatbot.incidencia_paciente SET fecha_creacion = now() - interval '200 days' WHERE trace_id IN ('t22-corrupcion', 't22-sin-categoria');
UPDATE chatbot.incidencia_paciente SET fecha_creacion = now() - interval '60 days' WHERE trace_id IN ('t22-queja-vieja', 't22-reabierto');
-- Llega a las 23:59 de Lima: el plazo igual empieza a contar el dia siguiente.
UPDATE chatbot.incidencia_paciente SET fecha_creacion = (SELECT (vencido || ' 23:59')::timestamp AT TIME ZONE 'America/Lima' FROM limite) WHERE trace_id = 't22-reclamo-vencido';
UPDATE chatbot.incidencia_paciente SET fecha_creacion = (SELECT (por_vencer || ' 00:01')::timestamp AT TIME ZONE 'America/Lima' FROM limite) WHERE trace_id = 't22-reclamo-por-vencer';
ALTER TABLE chatbot.incidencia_paciente ENABLE TRIGGER USER;

DO $$
BEGIN
  ASSERT (SELECT string_agg(trace_id || '=' || coalesce(categoria_id::text, '-') || '/' || estado_incidencia_id, ',' ORDER BY trace_id) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 't22-%')
         = 't22-corrupcion=1/2,t22-queja-vieja=2/6,t22-reabierto=3/6,t22-reclamo-por-vencer=3/2,t22-reclamo-vencido=3/2,t22-sin-categoria=-/1',
    'H18 los casos de prueba quedan con su categoria y su estado';

  ASSERT chatbot.archivar_incidencias_vencidas(3, 1000) = 3, 'H19 se archivan solo los tres casos vencidos de categorias que archivan por vencimiento';
  ASSERT (SELECT string_agg(trace_id, ',' ORDER BY trace_id) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 't22-%' AND estado_incidencia_id = 7)
         = 't22-queja-vieja,t22-reabierto,t22-reclamo-vencido',
    'H20 quedan archivados la queja vieja, el reclamo que cumplio 30 dias habiles y el que luego se reabre';
  ASSERT (SELECT estado_incidencia_id FROM chatbot.incidencia_paciente WHERE trace_id = 't22-corrupcion') = 2,
    'H21 una denuncia por corrupcion vencida no se archiva por vencimiento';
  ASSERT (SELECT estado_incidencia_id FROM chatbot.incidencia_paciente WHERE trace_id = 't22-reclamo-por-vencer') = 2,
    'H22 un reclamo al que le falta un dia habil no se archiva';
  ASSERT (SELECT estado_incidencia_id FROM chatbot.incidencia_paciente WHERE trace_id = 't22-sin-categoria') = 1,
    'H23 un caso sin categoria no se archiva por vencimiento';
  ASSERT (SELECT bool_and(i.usuario_modificacion = 'sistema:vencimiento' AND m.codigo = 'VENCIDA_SIN_ATENDER')
            FROM chatbot.incidencia_paciente i JOIN catalogo.motivo_archivo m ON m.id = i.motivo_archivo_id
           WHERE i.trace_id LIKE 't22-%' AND i.estado_incidencia_id = 7),
    'H24 se firman como sistema:vencimiento con el motivo VENCIDA_SIN_ATENDER';
  ASSERT chatbot.archivar_incidencias_vencidas(3, 1000) = 0, 'H25 no hay mas que archivar';
END $$;

SELECT set_config('app.actor', 'usuario:est-22', false);
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3, reabierto_motivo = 'Llegaron datos nuevos del paciente' WHERE trace_id = 't22-reabierto';
DO $$
BEGIN
  ASSERT (SELECT estado_incidencia_id = 3 AND reabierto_en IS NOT NULL AND fecha_creacion < now() - interval '59 days' FROM chatbot.incidencia_paciente WHERE trace_id = 't22-reabierto'),
    'H26 el caso se reabre aunque llego hace 60 dias';
  ASSERT chatbot.archivar_incidencias_vencidas(3, 1000) = 0, 'H27 un caso reabierto cuenta su plazo desde la reapertura, no desde su llegada';
END $$;

ALTER TABLE chatbot.incidencia_paciente DISABLE TRIGGER USER;
UPDATE chatbot.incidencia_paciente SET reabierto_en = now() - interval '40 days' WHERE trace_id = 't22-reabierto';
ALTER TABLE chatbot.incidencia_paciente ENABLE TRIGGER USER;
DO $$
BEGIN
  ASSERT chatbot.archivar_incidencias_vencidas(3, 1000) = 0, 'H28 reabierto hace 40 dias corridos aun no cumple 30 dias habiles';
END $$;

ALTER TABLE chatbot.incidencia_paciente DISABLE TRIGGER USER;
UPDATE chatbot.incidencia_paciente SET reabierto_en = now() - interval '44 days' WHERE trace_id = 't22-reabierto';
ALTER TABLE chatbot.incidencia_paciente ENABLE TRIGGER USER;
DO $$
BEGIN
  ASSERT chatbot.archivar_incidencias_vencidas(3, 1000) = 1, 'H29 reabierto hace 44 dias corridos ya cumplio 30 dias habiles y vuelve a vencer';
  ASSERT (SELECT estado_incidencia_id FROM chatbot.incidencia_paciente WHERE trace_id = 't22-reabierto') = 7, 'H29 queda archivado de nuevo';
END $$;

TRUNCATE chatbot.incidencia_etiqueta, chatbot.archivo_recibido, chatbot.solicitud_carga, chatbot.evidencia, chatbot.incidencia_paciente_auditoria,
         ia.entrenamiento_categoria, chatbot.incidencia_analisis, chatbot.incidencia_paciente, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion;

\echo TODAS LAS PRUEBAS DE PLAZOS EN DIAS HABILES PASARON
