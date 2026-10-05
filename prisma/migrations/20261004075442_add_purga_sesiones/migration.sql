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
  'Borra un lote de sesiones de conversación sin actividad por más de las horas indicadas (por defecto 1) y devuelve cuántas borró. Hay que repetirla hasta que devuelva 0. Solo toca sesiones, nunca mensajes, usuarios ni incidencias.';
