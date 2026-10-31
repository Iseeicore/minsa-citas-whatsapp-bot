CREATE OR REPLACE FUNCTION auditoria.cerrar_operaciones_interrumpidas(p_antiguedad interval, p_lote integer DEFAULT 1000) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  inicio record;
  cerradas integer := 0;
BEGIN
  IF p_antiguedad IS NULL OR p_antiguedad <= interval '0 seconds' OR p_lote IS NULL OR p_lote < 1 THEN
    RAISE EXCEPTION 'auditoria.cerrar_operaciones_interrumpidas: la antiguedad y el lote deben ser positivos'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('auditoria.cerrar_operaciones_interrumpidas'));
  FOR inicio IN
    SELECT DISTINCT ON (e.operacion_id) e.id, e.operacion_id, e.servicio, e.modulo, e.accion, e.fase, e.recurso_tipo, e.recurso_id
      FROM auditoria.evento e
     WHERE e.resultado = 'INICIADO'
       AND e.registrado_en < clock_timestamp() - p_antiguedad
       AND NOT EXISTS (
         SELECT 1 FROM auditoria.evento cierre
          WHERE cierre.operacion_id = e.operacion_id
            AND cierre.resultado IN ('COMPLETADO', 'FALLIDO', 'DENEGADO', 'INTERRUMPIDO'))
     ORDER BY e.operacion_id, e.registrado_en
     LIMIT p_lote
  LOOP
    PERFORM auditoria.registrar_evento(jsonb_build_object(
      'id', gen_random_uuid(), 'operacion_id', inicio.operacion_id, 'evento_padre_id', inicio.id,
      'origen', 'POSTGRESQL', 'servicio', inicio.servicio, 'modulo', inicio.modulo, 'accion', inicio.accion,
      'fase', inicio.fase, 'resultado', 'INTERRUMPIDO', 'actor_tipo', 'SISTEMA', 'actor_id', 'sistema:cierre_operaciones',
      'recurso_tipo', inicio.recurso_tipo, 'recurso_id', inicio.recurso_id, 'motivo_codigo', 'SIN_CIERRE'
    ));
    cerradas := cerradas + 1;
  END LOOP;
  RETURN cerradas;
END;
$$;

COMMENT ON FUNCTION auditoria.cerrar_operaciones_interrumpidas(interval, integer) IS 'Cierra las operaciones que quedaron a medias: por cada operación con un evento INICIADO más antiguo que p_antiguedad y sin evento de cierre (completado, fallido, denegado o interrumpido) agrega un evento INTERRUMPIDO con motivo SIN_CIERRE, hijo del evento iniciado. No modifica ni borra nada, atiende como mucho p_lote operaciones por llamada, no se cruza con otra llamada simultánea y devuelve cuántas cerró. Repetirla no cierra dos veces la misma operación.';
