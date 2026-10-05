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

SELECT set_config('app.actor', 'ciudadano:wa-carga', false);
INSERT INTO chatbot.usuario (wa_id) VALUES ('wa-carga');
INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id)
SELECT 1, id, wa_id, true, 'Reclamo con archivos', 'trace-carga-1' FROM chatbot.usuario WHERE wa_id = 'wa-carga';

INSERT INTO chatbot.solicitud_carga (incidencia_paciente_id, usuario_id, hash_token, vence_en, max_archivos, max_bytes_archivo)
SELECT i.id, i.usuario_id, 'hash-1', now() + interval '20 minutes', 5, 5242880
  FROM chatbot.incidencia_paciente i WHERE i.trace_id = 'trace-carga-1';

DO $$
DECLARE s chatbot.solicitud_carga;
BEGIN
  SELECT * INTO s FROM chatbot.solicitud_carga WHERE hash_token = 'hash-1';
  ASSERT s.id IS NOT NULL AND s.cerrada_en IS NULL, 'C01 la solicitud nace abierta con id generado por la base';
  ASSERT s.usuario_creacion = 'ciudadano:wa-carga' AND s.version_fila = 1, 'C01 la base firma la solicitud';
END $$;

SELECT pg_temp.espera_error($q$INSERT INTO chatbot.solicitud_carga (incidencia_paciente_id, usuario_id, hash_token, vence_en, max_archivos, max_bytes_archivo) SELECT incidencia_paciente_id, usuario_id, 'hash-1', now() + interval '1 hour', 5, 10 FROM chatbot.solicitud_carga LIMIT 1$q$, '23505', 'C02 el hash del token es unico');
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.solicitud_carga (incidencia_paciente_id, usuario_id, hash_token, vence_en, max_archivos, max_bytes_archivo) SELECT incidencia_paciente_id, usuario_id, 'hash-2', now() - interval '1 minute', 5, 10 FROM chatbot.solicitud_carga LIMIT 1$q$, '23514', 'C03 no se emite una solicitud ya vencida');
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.solicitud_carga (incidencia_paciente_id, usuario_id, hash_token, vence_en, max_archivos, max_bytes_archivo) SELECT incidencia_paciente_id, usuario_id, 'hash-3', now() + interval '1 hour', 0, 10 FROM chatbot.solicitud_carga LIMIT 1$q$, '23514', 'C04 los limites deben ser positivos');
SELECT pg_temp.espera_error($q$UPDATE chatbot.solicitud_carga SET vence_en = now() + interval '5 days' WHERE hash_token = 'hash-1'$q$, '23514', 'C05 los datos de emision no cambian');
SELECT pg_temp.espera_error($q$UPDATE chatbot.solicitud_carga SET max_archivos = 99 WHERE hash_token = 'hash-1'$q$, '23514', 'C06 los limites no cambian');
SELECT pg_temp.espera_error($q$DELETE FROM chatbot.solicitud_carga WHERE hash_token = 'hash-1'$q$, '23001', 'C07 la solicitud no se borra');

-- Archivos de la solicitud.
INSERT INTO chatbot.archivo_recibido (solicitud_carga_id, nombre_original, mime_declarado, tamano, ruta_cuarentena)
SELECT id, 'foto.png', 'image/png', 1024, 'cuarentena/a.png' FROM chatbot.solicitud_carga WHERE hash_token = 'hash-1';
INSERT INTO chatbot.archivo_recibido (solicitud_carga_id, nombre_original, mime_declarado, tamano, ruta_cuarentena)
SELECT id, 'informe.pdf', 'application/pdf', 2048, 'cuarentena/b.pdf' FROM chatbot.solicitud_carga WHERE hash_token = 'hash-1';
INSERT INTO chatbot.archivo_recibido (solicitud_carga_id, nombre_original, mime_declarado, tamano, ruta_cuarentena)
SELECT id, 'malo.zip', 'application/zip', 4096, 'cuarentena/c.zip' FROM chatbot.solicitud_carga WHERE hash_token = 'hash-1';

DO $$
DECLARE a chatbot.archivo_recibido;
BEGIN
  SELECT * INTO a FROM chatbot.archivo_recibido WHERE nombre_original = 'foto.png';
  ASSERT a.estado_archivo_id = 1 AND a.verificado_en IS NULL, 'C08 el archivo nace RECIBIDO, sin fecha de verificacion';
  ASSERT a.usuario_creacion = 'ciudadano:wa-carga' AND a.version_fila = 1, 'C08 la base firma el archivo';
END $$;

SELECT pg_temp.espera_error($q$INSERT INTO chatbot.archivo_recibido (solicitud_carga_id, mime_declarado, tamano, ruta_cuarentena) SELECT id, 'image/png', 0, 'x' FROM chatbot.solicitud_carga LIMIT 1$q$, '23514', 'C09 el tamano debe ser positivo');
SELECT pg_temp.espera_error($q$INSERT INTO chatbot.archivo_recibido (solicitud_carga_id, mime_declarado, tamano, ruta_cuarentena, estado_archivo_id) SELECT id, 'image/png', 5, 'x', 9 FROM chatbot.solicitud_carga LIMIT 1$q$, '23503', 'C10 el estado debe existir en el catalogo');

-- Recorrido normal: RECIBIDO -> VERIFICANDO -> VERIFICADO.
SELECT set_config('app.actor', 'sistema:broker', false);
UPDATE chatbot.archivo_recibido SET estado_archivo_id = 2 WHERE nombre_original = 'foto.png';

SELECT pg_temp.espera_error($q$UPDATE chatbot.archivo_recibido SET estado_archivo_id = 3 WHERE nombre_original = 'foto.png'$q$, '23514', 'C11 verificado exige el tipo detectado y la huella');
SELECT pg_temp.espera_error($q$UPDATE chatbot.archivo_recibido SET estado_archivo_id = 3, mime_detectado = 'image/png', hash_archivo = 'abc', verificado_en = now() WHERE nombre_original = 'foto.png'$q$, '23514', 'C12 la fecha de verificacion la llena la base');

UPDATE chatbot.archivo_recibido SET estado_archivo_id = 3, mime_detectado = 'image/png', hash_archivo = 'sha256-foto' WHERE nombre_original = 'foto.png';

DO $$
DECLARE a chatbot.archivo_recibido;
BEGIN
  SELECT * INTO a FROM chatbot.archivo_recibido WHERE nombre_original = 'foto.png';
  ASSERT a.estado_archivo_id = 3 AND a.verificado_en IS NOT NULL, 'C13 al verificarse la base fija la fecha';
  ASSERT a.usuario_modificacion = 'sistema:broker' AND a.version_fila >= 3, 'C13 la base firma quien verifico';
END $$;

SELECT pg_temp.espera_error($q$UPDATE chatbot.archivo_recibido SET estado_archivo_id = 4, motivo_rechazo = 'x' WHERE nombre_original = 'foto.png'$q$, '23514', 'C14 un archivo verificado ya no cambia');
SELECT pg_temp.espera_error($q$UPDATE chatbot.archivo_recibido SET mime_detectado = 'image/jpeg' WHERE nombre_original = 'foto.png'$q$, '23514', 'C15 el tipo detectado final no cambia');

-- Rechazo: exige motivo y es final.
SELECT pg_temp.espera_error($q$UPDATE chatbot.archivo_recibido SET estado_archivo_id = 4 WHERE nombre_original = 'malo.zip'$q$, '23514', 'C16 rechazar exige un motivo');
UPDATE chatbot.archivo_recibido SET estado_archivo_id = 4, motivo_rechazo = 'Tipo de archivo no permitido' WHERE nombre_original = 'malo.zip';
SELECT pg_temp.espera_error($q$UPDATE chatbot.archivo_recibido SET estado_archivo_id = 2 WHERE nombre_original = 'malo.zip'$q$, '23514', 'C17 un rechazado no vuelve a analizarse');

-- Transiciones y datos de recepcion.
SELECT pg_temp.espera_error($q$UPDATE chatbot.archivo_recibido SET estado_archivo_id = 3, mime_detectado = 'application/pdf', hash_archivo = 'h' WHERE nombre_original = 'informe.pdf'$q$, '23514', 'C18 no se salta VERIFICANDO');
SELECT pg_temp.espera_error($q$UPDATE chatbot.archivo_recibido SET ruta_cuarentena = 'otra' WHERE nombre_original = 'informe.pdf'$q$, '23514', 'C19 lo recibido no se reescribe');
SELECT pg_temp.espera_error($q$UPDATE chatbot.archivo_recibido SET mime_declarado = 'application/zip' WHERE nombre_original = 'informe.pdf'$q$, '23514', 'C20 el tipo declarado no cambia');
UPDATE chatbot.archivo_recibido SET estado_archivo_id = 2 WHERE nombre_original = 'informe.pdf';
UPDATE chatbot.archivo_recibido SET estado_archivo_id = 1 WHERE nombre_original = 'informe.pdf';
DO $$
BEGIN
  ASSERT (SELECT estado_archivo_id FROM chatbot.archivo_recibido WHERE nombre_original = 'informe.pdf') = 1, 'C21 un archivo en analisis puede volver a RECIBIDO (reintento)';
END $$;
SELECT pg_temp.espera_error($q$DELETE FROM chatbot.archivo_recibido WHERE nombre_original = 'informe.pdf'$q$, '23001', 'C22 el archivo no se borra');

-- Promocion a evidencia: el verificado se enlaza una sola vez.
INSERT INTO chatbot.evidencia (incidencia_paciente_id, tipo_evidencia_id, mime_type, tamano, ruta)
SELECT i.id, 1, 'image/png', 1024, 'definitivo/a.png' FROM chatbot.incidencia_paciente i WHERE i.trace_id = 'trace-carga-1';
UPDATE chatbot.archivo_recibido SET evidencia_id = (SELECT id FROM chatbot.evidencia LIMIT 1) WHERE nombre_original = 'foto.png';
DO $$
BEGIN
  ASSERT (SELECT evidencia_id FROM chatbot.archivo_recibido WHERE nombre_original = 'foto.png') IS NOT NULL, 'C23 el verificado se enlaza a su evidencia';
END $$;
SELECT pg_temp.espera_error($q$UPDATE chatbot.archivo_recibido SET evidencia_id = NULL WHERE nombre_original = 'foto.png'$q$, '23514', 'C24 el enlace a la evidencia no se quita');

-- Conteo que usara el bot: formatos recibidos por incidencia.
DO $$
DECLARE r record; verificados int; rechazados int; pendientes int;
BEGIN
  SELECT count(*) FILTER (WHERE a.estado_archivo_id = 3),
         count(*) FILTER (WHERE a.estado_archivo_id = 4),
         count(*) FILTER (WHERE a.estado_archivo_id IN (1, 2))
    INTO verificados, rechazados, pendientes
    FROM chatbot.archivo_recibido a
    JOIN chatbot.solicitud_carga s ON s.id = a.solicitud_carga_id
    JOIN chatbot.incidencia_paciente i ON i.id = s.incidencia_paciente_id
   WHERE i.trace_id = 'trace-carga-1';
  ASSERT verificados = 1 AND rechazados = 1 AND pendientes = 1, 'C25 el conteo por estado de una incidencia';
END $$;

-- Cierre de la solicitud: una sola vez, con la fecha de la base.
UPDATE chatbot.solicitud_carga SET cerrada_en = now() WHERE hash_token = 'hash-1';
DO $$
BEGIN
  ASSERT (SELECT cerrada_en FROM chatbot.solicitud_carga WHERE hash_token = 'hash-1') IS NOT NULL, 'C26 la solicitud queda cerrada';
END $$;
SELECT pg_temp.espera_error($q$UPDATE chatbot.solicitud_carga SET cerrada_en = NULL WHERE hash_token = 'hash-1'$q$, '23514', 'C27 no se reabre');
SELECT pg_temp.espera_error($q$UPDATE chatbot.solicitud_carga SET cerrada_en = now() WHERE hash_token = 'hash-1'$q$, '23514', 'C28 no se cierra dos veces');

TRUNCATE chatbot.archivo_recibido, chatbot.evidencia, chatbot.solicitud_carga, chatbot.incidencia_paciente_auditoria,
         ia.entrenamiento_categoria, chatbot.incidencia_paciente, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion;

\echo TODAS LAS PRUEBAS DE CARGA PASARON
