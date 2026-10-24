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

COMMENT ON FUNCTION chatbot.barrer_archivos_huerfanos(integer) IS 'Toma un lote de solicitudes de carga vencidas que nunca llegaron a tener incidencia, rechaza sus archivos pendientes de verificar (motivo: sesión vencida), cierra la solicitud y devuelve las rutas de los archivos que no son evidencia para que un proceso externo los borre del almacenamiento. Hay que repetirla hasta que no devuelva filas.';
