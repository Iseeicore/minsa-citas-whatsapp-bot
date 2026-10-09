-- Purga de sesiones inactivas. Borra UN lote de sesiones sin actividad por mas de `p_horas` horas y devuelve cuantas
-- borro; quien la programa (pg_cron, el cron del servidor, etc.) la repite hasta que devuelva 0. Asi ninguna llamada
-- mantiene bloqueos largos. SKIP LOCKED evita pelear con una sesion que se esta usando justo ahora.
-- Solo toca chatbot.sesion_conversacion: los mensajes, usuarios e incidencias tienen su propia retencion.
CREATE OR REPLACE FUNCTION chatbot.purgar_sesiones_inactivas(p_horas integer DEFAULT 1, p_lote integer DEFAULT 1000)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_borradas integer;
BEGIN
  IF p_horas IS NULL OR p_horas < 1 THEN
    RAISE EXCEPTION 'purgar_sesiones_inactivas: las horas deben ser al menos 1'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_lote IS NULL OR p_lote < 1 THEN
    RAISE EXCEPTION 'purgar_sesiones_inactivas: el lote debe ser al menos 1'
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM chatbot.sesion_conversacion
   WHERE id IN (
     SELECT id
       FROM chatbot.sesion_conversacion
      WHERE fecha_modificacion < now() - make_interval(hours => p_horas)
      ORDER BY fecha_modificacion
      LIMIT p_lote
        FOR UPDATE SKIP LOCKED
   );
  GET DIAGNOSTICS v_borradas = ROW_COUNT;
  RETURN v_borradas;
END;
$$;

COMMENT ON FUNCTION chatbot.purgar_sesiones_inactivas(integer, integer) IS
  'Borra un lote de sesiones de conversación (borradores de reporte) sin actividad por más de las horas indicadas (por defecto 1) y devuelve cuántas borró. Cada llamada borra como máximo el lote indicado (por defecto 1000) y se salta las sesiones en uso, así que hay que repetirla hasta que devuelva 0. Solo toca sesiones, nunca mensajes, usuarios ni incidencias; los archivos huérfanos de los borradores los limpia barrer_archivos_huerfanos.';

-- Barrido de archivos huerfanos. Una solicitud de carga emitida desde el borrador del chat (sin incidencia, con sesion_id)
-- que vence sin que el reporte se complete deja archivos sin dueno. Esta funcion toma UN lote de esas solicitudes vencidas,
-- rechaza sus archivos que aun no terminaron de verificarse (motivo 'sesión vencida'), cierra la solicitud y devuelve las
-- rutas de los archivos que no llegaron a ser evidencia, para que un proceso externo los borre del almacenamiento. Quien la
-- programa la repite hasta que no devuelva filas. La solicitud cerrada no vuelve a barrerse.
CREATE OR REPLACE FUNCTION chatbot.barrer_archivos_huerfanos(p_lote integer DEFAULT 1000)
RETURNS TABLE (ruta text)
LANGUAGE plpgsql AS $$
DECLARE
  v_ids uuid[];
BEGIN
  IF p_lote IS NULL OR p_lote < 1 THEN
    RAISE EXCEPTION 'barrer_archivos_huerfanos: el lote debe ser al menos 1'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.actor', 'sistema:barrido', true);

  v_ids := ARRAY(
    SELECT id
      FROM chatbot.solicitud_carga
     WHERE incidencia_paciente_id IS NULL
       AND cerrada_en IS NULL
       AND vence_en < now()
     ORDER BY vence_en
     LIMIT p_lote
       FOR UPDATE SKIP LOCKED
  );
  IF coalesce(cardinality(v_ids), 0) = 0 THEN
    RETURN;
  END IF;

  UPDATE chatbot.archivo_recibido
     SET estado_archivo_id = 4, motivo_rechazo = 'sesión vencida'
   WHERE solicitud_carga_id = ANY (v_ids) AND estado_archivo_id IN (1, 2);

  UPDATE chatbot.solicitud_carga SET cerrada_en = now() WHERE id = ANY (v_ids);

  RETURN QUERY
    SELECT a.ruta_cuarentena
      FROM chatbot.archivo_recibido a
     WHERE a.solicitud_carga_id = ANY (v_ids) AND a.evidencia_id IS NULL;
END;
$$;

COMMENT ON FUNCTION chatbot.barrer_archivos_huerfanos(integer) IS
  'Toma un lote de solicitudes de carga vencidas que nunca llegaron a tener incidencia, rechaza sus archivos pendientes de verificar (motivo: sesión vencida), cierra la solicitud y devuelve las rutas de los archivos que no son evidencia para que un proceso externo los borre del almacenamiento. Hay que repetirla hasta que no devuelva filas.';
