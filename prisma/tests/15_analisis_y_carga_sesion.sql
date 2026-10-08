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

SELECT set_config('app.actor', 'ciudadano:wa-t15', false);
INSERT INTO chatbot.usuario (wa_id) VALUES ('wa-t15');
INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id)
SELECT 1, u.id, u.wa_id, true, 'Caso ' || t, 't15-' || t FROM chatbot.usuario u, unnest(ARRAY['a', 'b']) AS t WHERE u.wa_id = 'wa-t15';

-- ===== Analisis de la incidencia: uno por incidencia, solo se inserta =====
SELECT set_config('app.actor', 'sistema:analisis', false);
INSERT INTO chatbot.incidencia_analisis (incidencia_paciente_id, version_reglas, puntaje, senales, cargo_mencionado, area_mencionada_id, nombre_mencionado)
SELECT i.id, 'reglas-v1', 87, '{"menciona_dinero": true, "palabras": ["cobro"]}'::jsonb, 'Jefe de admision', a.id, 'Pedro Quispe Mamani'
  FROM chatbot.incidencia_paciente i, catalogo.area a WHERE i.trace_id = 't15-a' AND a.codigo = 'OTRANS';

DO $$
DECLARE n chatbot.incidencia_analisis;
BEGIN
  SELECT * INTO n FROM chatbot.incidencia_analisis WHERE incidencia_paciente_id = (SELECT id FROM chatbot.incidencia_paciente WHERE trace_id = 't15-a');
  ASSERT n.puntaje = 87 AND n.senales @> '{"menciona_dinero": true}' AND n.version_reglas = 'reglas-v1', 'N01 el analisis guarda puntaje, senales y version de las reglas';
  ASSERT n.usuario_creacion = 'sistema:analisis' AND n.fecha_creacion IS NOT NULL, 'N02 la base firma el analisis';
  ASSERT n.area_mencionada_id = (SELECT id FROM catalogo.area WHERE codigo = 'OTRANS') AND n.cargo_mencionado = 'Jefe de admision', 'N03 guarda el cargo y el area mencionados';
  ASSERT NOT EXISTS (SELECT 1 FROM chatbot.incidencia_paciente_auditoria WHERE cambios::text LIKE '%Quispe%'), 'N04 el nombre mencionado no pasa al historial de cambios de la incidencia';
END $$;

SELECT pg_temp.espera_error($q$INSERT INTO chatbot.incidencia_analisis (incidencia_paciente_id, version_reglas, puntaje, senales) SELECT id, 'reglas-v2', 10, '{}' FROM chatbot.incidencia_paciente WHERE trace_id = 't15-a'$q$, '23505', 'N05 hay un solo analisis por incidencia');
SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_analisis SET puntaje = 1$q$, '23001', 'N06 el analisis no se modifica');
SELECT pg_temp.espera_error($q$DELETE FROM chatbot.incidencia_analisis$q$, '23001', 'N07 el analisis no se borra');
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.incidencia_analisis (incidencia_paciente_id, version_reglas, puntaje, senales) VALUES (uuidv7(), 'reglas-v1', 1, '{}')$q$, '23503', 'N08 el analisis exige una incidencia que exista');
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.incidencia_analisis (incidencia_paciente_id, version_reglas, puntaje, senales, area_mencionada_id) SELECT id, 'reglas-v1', 1, '{}', 99999 FROM chatbot.incidencia_paciente WHERE trace_id = 't15-b'$q$, '23503', 'N09 el area mencionada debe existir');
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.incidencia_analisis (incidencia_paciente_id, version_reglas, puntaje) SELECT id, 'reglas-v1', 1 FROM chatbot.incidencia_paciente WHERE trace_id = 't15-b'$q$, '23502', 'N10 las senales son obligatorias');

-- ===== Solicitud de carga ligada a la sesion del borrador =====
SELECT set_config('app.actor', 'ciudadano:wa-t15', false);
INSERT INTO chatbot.sesion_conversacion (wa_id, estado, slots, contadores) VALUES ('wa-t15', 'incidencia_awaiting_evidence', '{}', '{}');

INSERT INTO chatbot.solicitud_carga (incidencia_paciente_id, sesion_id, usuario_id, hash_token, vence_en, max_archivos, max_bytes_archivo)
SELECT NULL, s.id, u.id, 'hash-t15-sesion', now() + interval '20 minutes', 5, 5242880
  FROM chatbot.sesion_conversacion s, chatbot.usuario u WHERE s.wa_id = 'wa-t15' AND u.wa_id = 'wa-t15';

DO $$
DECLARE s chatbot.solicitud_carga;
BEGIN
  SELECT * INTO s FROM chatbot.solicitud_carga WHERE hash_token = 'hash-t15-sesion';
  ASSERT s.incidencia_paciente_id IS NULL AND s.sesion_id = (SELECT id FROM chatbot.sesion_conversacion WHERE wa_id = 'wa-t15'), 'S01 la solicitud nace ligada a la sesion, sin incidencia';
END $$;

SELECT pg_temp.espera_error($q$INSERT INTO chatbot.solicitud_carga (usuario_id, hash_token, vence_en, max_archivos, max_bytes_archivo) SELECT id, 'hash-t15-sin-destino', now() + interval '1 hour', 5, 10 FROM chatbot.usuario WHERE wa_id = 'wa-t15'$q$, '23514', 'S02 una solicitud necesita incidencia o sesion');
SELECT pg_temp.espera_error($q$UPDATE chatbot.solicitud_carga SET sesion_id = uuidv7() WHERE hash_token = 'hash-t15-sesion'$q$, '23514', 'S03 la sesion de la solicitud no cambia');

UPDATE chatbot.solicitud_carga SET incidencia_paciente_id = (SELECT id FROM chatbot.incidencia_paciente WHERE trace_id = 't15-a') WHERE hash_token = 'hash-t15-sesion';
DO $$
DECLARE s chatbot.solicitud_carga;
BEGIN
  SELECT * INTO s FROM chatbot.solicitud_carga WHERE hash_token = 'hash-t15-sesion';
  ASSERT s.incidencia_paciente_id = (SELECT id FROM chatbot.incidencia_paciente WHERE trace_id = 't15-a') AND s.sesion_id IS NOT NULL, 'S04 la incidencia se enlaza una vez y la sesion se conserva como rastro';
END $$;
SELECT pg_temp.espera_error($q$UPDATE chatbot.solicitud_carga SET incidencia_paciente_id = (SELECT id FROM chatbot.incidencia_paciente WHERE trace_id = 't15-b') WHERE hash_token = 'hash-t15-sesion'$q$, '23514', 'S05 la incidencia no se cambia una vez enlazada');
SELECT pg_temp.espera_error($q$UPDATE chatbot.solicitud_carga SET incidencia_paciente_id = NULL WHERE hash_token = 'hash-t15-sesion'$q$, '23514', 'S06 la incidencia no se quita');

DELETE FROM chatbot.sesion_conversacion WHERE wa_id = 'wa-t15';
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM chatbot.solicitud_carga WHERE hash_token = 'hash-t15-sesion') = 1, 'S07 la purga de la sesion no toca la solicitud (no hay llave foranea a proposito)';
END $$;

-- ===== Barrido de archivos huerfanos =====
CREATE FUNCTION pg_temp.solicitud_vencida(p_hash text, p_con_incidencia boolean, p_cerrada boolean) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.actor', 'ciudadano:wa-t15', false);
  INSERT INTO chatbot.solicitud_carga (incidencia_paciente_id, sesion_id, usuario_id, hash_token, vence_en, max_archivos, max_bytes_archivo)
  SELECT CASE WHEN p_con_incidencia THEN (SELECT id FROM chatbot.incidencia_paciente WHERE trace_id = 't15-b') END,
         CASE WHEN p_con_incidencia THEN NULL ELSE uuidv7() END,
         u.id, p_hash, now() + interval '20 minutes', 5, 100
    FROM chatbot.usuario u WHERE u.wa_id = 'wa-t15';
  IF p_cerrada THEN
    UPDATE chatbot.solicitud_carga SET cerrada_en = now() WHERE hash_token = p_hash;
  END IF;
END;
$$;

SELECT pg_temp.solicitud_vencida('barrido-huerfana', false, false);
SELECT pg_temp.solicitud_vencida('barrido-huerfana-2', false, false);
SELECT pg_temp.solicitud_vencida('barrido-con-incidencia', true, false);
SELECT pg_temp.solicitud_vencida('barrido-cerrada', false, true);
SELECT pg_temp.solicitud_vencida('barrido-vigente', false, false);

INSERT INTO chatbot.archivo_recibido (solicitud_carga_id, nombre_original, mime_declarado, tamano, ruta_cuarentena)
SELECT s.id, v.nombre, 'image/png', 10, 'cuarentena/' || v.nombre
  FROM chatbot.solicitud_carga s,
       (VALUES ('barrido-huerfana', 'recibido.png'), ('barrido-huerfana', 'verificando.png'), ('barrido-huerfana', 'verificado.png'),
               ('barrido-huerfana', 'rechazado.png'), ('barrido-huerfana', 'promovido.png'), ('barrido-huerfana-2', 'otra-solicitud.png'),
               ('barrido-con-incidencia', 'con-incidencia.png'), ('barrido-cerrada', 'cerrada.png'), ('barrido-vigente', 'vigente.png')) AS v(hash, nombre)
 WHERE s.hash_token = v.hash;

UPDATE chatbot.archivo_recibido SET estado_archivo_id = 2 WHERE nombre_original IN ('verificando.png', 'verificado.png', 'promovido.png', 'rechazado.png');
UPDATE chatbot.archivo_recibido SET estado_archivo_id = 3, mime_detectado = 'image/png', hash_archivo = 'h' WHERE nombre_original IN ('verificado.png', 'promovido.png');
UPDATE chatbot.archivo_recibido SET estado_archivo_id = 4, motivo_rechazo = 'Tipo de archivo no permitido' WHERE nombre_original = 'rechazado.png';
INSERT INTO chatbot.evidencia (incidencia_paciente_id, tipo_evidencia_id, mime_type, tamano, ruta)
SELECT id, 1, 'image/png', 10, 'definitivo/promovido.png' FROM chatbot.incidencia_paciente WHERE trace_id = 't15-b';
UPDATE chatbot.archivo_recibido SET evidencia_id = (SELECT id FROM chatbot.evidencia WHERE ruta = 'definitivo/promovido.png') WHERE nombre_original = 'promovido.png';

-- Se vencen las solicitudes sin pasar por la regla que impide modificarlas
ALTER TABLE chatbot.solicitud_carga DISABLE TRIGGER USER;
UPDATE chatbot.solicitud_carga SET fecha_creacion = now() - interval '2 hours', vence_en = now() - interval '1 hour'
 WHERE hash_token IN ('barrido-huerfana', 'barrido-huerfana-2', 'barrido-con-incidencia', 'barrido-cerrada');
ALTER TABLE chatbot.solicitud_carga ENABLE TRIGGER USER;

SELECT pg_temp.espera_error($q$SELECT * FROM chatbot.barrer_archivos_huerfanos(0)$q$, '23514', 'W01 el lote debe ser al menos 1');
SELECT pg_temp.espera_error($q$SELECT * FROM chatbot.barrer_archivos_huerfanos(NULL)$q$, '23514', 'W02 el lote no puede ser nulo');

CREATE TEMP TABLE barrido_1 AS SELECT ruta FROM chatbot.barrer_archivos_huerfanos(1);
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM chatbot.solicitud_carga WHERE hash_token LIKE 'barrido-huerfana%' AND cerrada_en IS NOT NULL) = 1, 'W03 con lote 1 se cierra una sola solicitud';
END $$;

CREATE TEMP TABLE barrido_2 AS SELECT ruta FROM chatbot.barrer_archivos_huerfanos(1000);
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM chatbot.solicitud_carga WHERE hash_token LIKE 'barrido-huerfana%' AND cerrada_en IS NOT NULL) = 2, 'W04 el siguiente lote cierra la otra solicitud huerfana';
  ASSERT (SELECT string_agg(ruta, ',' ORDER BY ruta) FROM (SELECT ruta FROM barrido_1 UNION ALL SELECT ruta FROM barrido_2) t)
         = 'cuarentena/otra-solicitud.png,cuarentena/rechazado.png,cuarentena/recibido.png,cuarentena/verificado.png,cuarentena/verificando.png',
    'W05 devuelve las rutas de los archivos que no llegaron a ser evidencia (no la del promovido)';
  ASSERT (SELECT string_agg(a.nombre_original || '=' || a.estado_archivo_id || ':' || coalesce(a.motivo_rechazo, '-'), ',' ORDER BY a.nombre_original)
            FROM chatbot.archivo_recibido a JOIN chatbot.solicitud_carga s ON s.id = a.solicitud_carga_id WHERE s.hash_token LIKE 'barrido-huerfana%')
         = 'otra-solicitud.png=4:sesión vencida,promovido.png=3:-,rechazado.png=4:Tipo de archivo no permitido,recibido.png=4:sesión vencida,verificado.png=3:-,verificando.png=4:sesión vencida',
    'W06 rechaza con el motivo "sesión vencida" solo lo que no termino de verificarse';
  ASSERT (SELECT bool_and(a.usuario_modificacion = 'sistema:barrido') FROM chatbot.archivo_recibido a WHERE a.nombre_original IN ('recibido.png', 'verificando.png', 'otra-solicitud.png')),
    'W07 el barrido firma como sistema:barrido';
  ASSERT (SELECT bool_and(cerrada_en IS NULL) FROM chatbot.solicitud_carga WHERE hash_token IN ('barrido-con-incidencia', 'barrido-vigente')),
    'W08 no toca las solicitudes con incidencia ni las vigentes';
  ASSERT (SELECT estado_archivo_id FROM chatbot.archivo_recibido WHERE nombre_original = 'con-incidencia.png') = 1
         AND (SELECT estado_archivo_id FROM chatbot.archivo_recibido WHERE nombre_original = 'vigente.png') = 1, 'W08 sus archivos siguen RECIBIDOS';
  ASSERT (SELECT estado_archivo_id FROM chatbot.archivo_recibido WHERE nombre_original = 'cerrada.png') = 1, 'W09 una solicitud ya cerrada no se vuelve a barrer';
  ASSERT NOT EXISTS (SELECT 1 FROM chatbot.barrer_archivos_huerfanos(1000)), 'W10 una segunda pasada no devuelve nada';
END $$;

TRUNCATE chatbot.archivo_recibido, chatbot.solicitud_carga, chatbot.evidencia, chatbot.incidencia_paciente_auditoria,
         ia.entrenamiento_categoria, chatbot.incidencia_analisis, chatbot.incidencia_paciente, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion;

\echo TODAS LAS PRUEBAS DE ANALISIS Y CARGA POR SESION PASARON
