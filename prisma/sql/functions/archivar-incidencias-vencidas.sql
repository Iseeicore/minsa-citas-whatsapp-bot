CREATE OR REPLACE FUNCTION chatbot.archivar_incidencias_vencidas(p_lote integer DEFAULT 1000)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_archivadas integer;
BEGIN
  IF p_lote IS NULL OR p_lote < 1 THEN
    RAISE EXCEPTION 'archivar_incidencias_vencidas: el lote debe ser al menos 1'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.actor', 'sistema:vencimiento', true);

  UPDATE chatbot.incidencia_paciente
     SET estado_incidencia_id = 7
   WHERE id IN (
     SELECT i.id
       FROM chatbot.incidencia_paciente i
       JOIN catalogo.categoria_incidencia c ON c.id = i.categoria_id
      WHERE i.estado_incidencia_id IN (1, 2, 3, 6)
        AND i.activo
        AND c.archiva_por_vencimiento
        AND now() >= catalogo.sumar_dias_habiles(coalesce(i.reabierto_en, i.fecha_creacion), c.plazo_dias_habiles)
      ORDER BY coalesce(i.reabierto_en, i.fecha_creacion)
      LIMIT p_lote
        FOR UPDATE OF i SKIP LOCKED
   );
  GET DIAGNOSTICS v_archivadas = ROW_COUNT;
  RETURN v_archivadas;
END;
$$;

COMMENT ON FUNCTION chatbot.archivar_incidencias_vencidas(integer) IS 'Archiva un lote de incidencias abiertas (registradas, clasificadas, derivadas o en gestión) cuyo plazo de atención venció y devuelve cuántas archivó. El plazo es el de la categoría del caso (catalogo.categoria_incidencia.plazo_dias_habiles, en días hábiles, contado desde la llegada o, si se reabrió, desde la reapertura); solo se archivan las categorías con archiva_por_vencimiento y nunca un caso sin categoría. Hay que repetirla hasta que devuelva 0. Se firma como sistema:vencimiento.';
