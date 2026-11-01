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
    SELECT DISTINCT ON (e.operacion_id, e.accion)
           e.id, e.operacion_id, e.servicio, e.modulo, e.accion,
           CASE WHEN e.fase IN ('SOLICITUD', 'ENTREGA') THEN 'ENTREGA' ELSE e.fase END AS fase_cierre,
           e.recurso_tipo, e.recurso_id
      FROM auditoria.evento e
     WHERE e.resultado = 'INICIADO'
       AND e.accion <> 'CANAL_EVENTOS'
       AND e.registrado_en < clock_timestamp() - p_antiguedad
       AND NOT EXISTS (
         SELECT 1 FROM auditoria.evento cierre
          WHERE cierre.operacion_id = e.operacion_id
            AND cierre.accion = e.accion
            AND cierre.fase = CASE WHEN e.fase IN ('SOLICITUD', 'ENTREGA') THEN 'ENTREGA' ELSE e.fase END
            AND (
              cierre.resultado IN ('COMPLETADO', 'INTERRUMPIDO')
              OR (e.fase NOT IN ('SOLICITUD', 'ENTREGA') AND cierre.resultado IN ('FALLIDO', 'DENEGADO'))
            ))
     ORDER BY e.operacion_id, e.accion, e.registrado_en, e.id
     LIMIT p_lote
  LOOP
    PERFORM auditoria.registrar_evento(jsonb_build_object(
      'id', gen_random_uuid(), 'operacion_id', inicio.operacion_id, 'evento_padre_id', inicio.id,
      'origen', 'POSTGRESQL', 'servicio', inicio.servicio, 'modulo', inicio.modulo, 'accion', inicio.accion,
      'fase', inicio.fase_cierre, 'resultado', 'INTERRUMPIDO', 'actor_tipo', 'SISTEMA', 'actor_id', 'sistema:cierre_operaciones',
      'recurso_tipo', inicio.recurso_tipo, 'recurso_id', inicio.recurso_id, 'motivo_codigo', 'SIN_CIERRE'
    ));
    cerradas := cerradas + 1;
  END LOOP;
  RETURN cerradas;
END;
$$;

COMMENT ON FUNCTION auditoria.cerrar_operaciones_interrumpidas(interval, integer) IS 'Cierra las acciones que quedaron a medias: por cada operación y acción con un evento INICIADO más antiguo que p_antiguedad y sin cierre en su fase agrega un evento INTERRUMPIDO con motivo SIN_CIERRE, hijo del primer evento iniciado. Una solicitud HTTP (fase SOLICITUD o ENTREGA) solo la cierra una ENTREGA completada o interrumpida: ni el commit de la transacción ni una autorización denegada la cierran, y su cierre se registra en ENTREGA. Las demás fases se cierran con un evento completado, fallido, denegado o interrumpido de esa misma fase. La acción CANAL_EVENTOS queda fuera, porque un canal en vivo puede seguir abierto. SIN_CIERRE significa que falta la evidencia del cierre; no prueba que la respuesta se perdiera ni que se perdieran datos. No modifica ni borra nada, atiende como mucho p_lote acciones por llamada, no se cruza con otra llamada simultánea y devuelve cuántas cerró. Repetirla no cierra dos veces la misma acción.';
