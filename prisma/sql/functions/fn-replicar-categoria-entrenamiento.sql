CREATE OR REPLACE FUNCTION public.fn_replicar_categoria_entrenamiento() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_apto boolean := NOT (
    NEW.estado_incidencia_id = 7
    AND EXISTS (SELECT 1 FROM catalogo.motivo_archivo WHERE id = NEW.motivo_archivo_id AND codigo IN ('DATOS_INSUFICIENTES', 'NO_CORRESPONDE'))
  );
BEGIN
  INSERT INTO ia.entrenamiento_categoria
    (incidencia_paciente_id, texto_entrenamiento, categoria_ia_id, categoria_final_id, fue_corregida,
     categoria_confianza, version_clasificador, revisado_por, fecha_revision, apto_entrenamiento, usuario_creacion)
  VALUES
    (NEW.id, NEW.descripcion, NEW.categoria_ia_id, NEW.categoria_id, NEW.categoria_corregida_en IS NOT NULL,
     NEW.categoria_confianza, NEW.version_clasificador,
     coalesce(NEW.categoria_corregida_por, NEW.categoria_confirmada_por),
     coalesce(NEW.categoria_corregida_en, NEW.categoria_confirmada_en),
     v_apto,
     coalesce(NEW.categoria_corregida_por, NEW.categoria_confirmada_por));
  RETURN NULL;
END;
$$;
