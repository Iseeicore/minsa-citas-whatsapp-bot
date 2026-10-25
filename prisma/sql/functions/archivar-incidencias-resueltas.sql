CREATE OR REPLACE FUNCTION chatbot.archivar_incidencias_resueltas(p_dias integer, p_lote integer DEFAULT 1000)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_archivadas integer;
BEGIN
  IF p_dias IS NULL OR p_dias < 1 THEN
    RAISE EXCEPTION 'archivar_incidencias_resueltas: los dias deben ser al menos 1'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_lote IS NULL OR p_lote < 1 THEN
    RAISE EXCEPTION 'archivar_incidencias_resueltas: el lote debe ser al menos 1'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.actor', 'sistema:archivado', true);

  UPDATE chatbot.incidencia_paciente
     SET estado_incidencia_id = 7
   WHERE id IN (
     SELECT id
       FROM chatbot.incidencia_paciente
      WHERE estado_incidencia_id = 4
        AND activo
        AND resuelto_en < now() - make_interval(days => p_dias)
      ORDER BY resuelto_en
      LIMIT p_lote
        FOR UPDATE SKIP LOCKED
   );
  GET DIAGNOSTICS v_archivadas = ROW_COUNT;
  RETURN v_archivadas;
END;
$$;

COMMENT ON FUNCTION chatbot.archivar_incidencias_resueltas(integer, integer) IS 'Archiva un lote de incidencias resueltas hace más de los días indicados (la vigencia de la resolución, que define quien la llama) y devuelve cuántas archivó. Hay que repetirla hasta que devuelva 0.';
