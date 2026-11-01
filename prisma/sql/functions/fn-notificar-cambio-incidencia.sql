CREATE OR REPLACE FUNCTION chatbot.fn_notificar_cambio_incidencia()
RETURNS trigger
LANGUAGE plpgsql
AS $funcion$
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(
    OLD.estado_incidencia_id, OLD.categoria_id, OLD.area_destino_id, OLD.establecimiento_id,
    OLD.activo, OLD.categoria_confirmada_en, OLD.categoria_corregida_en,
    OLD.tomado_por, OLD.tomado_en, OLD.resuelto_en, OLD.motivo_archivo_id,
    OLD.archivado_en, OLD.reabierto_en, OLD.fecha_creacion, OLD.descripcion, OLD.habilitado_gestores
  ) IS NOT DISTINCT FROM ROW(
    NEW.estado_incidencia_id, NEW.categoria_id, NEW.area_destino_id, NEW.establecimiento_id,
    NEW.activo, NEW.categoria_confirmada_en, NEW.categoria_corregida_en,
    NEW.tomado_por, NEW.tomado_en, NEW.resuelto_en, NEW.motivo_archivo_id,
    NEW.archivado_en, NEW.reabierto_en, NEW.fecha_creacion, NEW.descripcion, NEW.habilitado_gestores
  ) THEN
    RETURN NULL;
  END IF;
  PERFORM pg_notify('minsa_incidencias_cambio', json_build_object(
    'areaAntes', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.area_destino_id END,
    'areaDespues', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.area_destino_id END,
    'categoriaAntes', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.categoria_id END,
    'categoriaDespues', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.categoria_id END
  )::text);
  RETURN NULL;
END;
$funcion$;

COMMENT ON FUNCTION chatbot.fn_notificar_cambio_incidencia() IS 'minsa-incidencias:eventos-v3. Avisa por el canal minsa_incidencias_cambio cada alta, cambio o borrado de una incidencia que toque un dato de negocio; un cambio que solo renueva campos de auditoría no avisa. El aviso lleva solo el área y la categoría de antes y de después, nunca datos del ciudadano, y PostgreSQL lo entrega después del commit: un rollback no avisa.';
