CREATE OR REPLACE FUNCTION public.fn_marcar_entrenamiento_archivo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.estado_incidencia_id = 7 THEN
    IF EXISTS (SELECT 1 FROM catalogo.motivo_archivo WHERE id = NEW.motivo_archivo_id AND codigo IN ('DATOS_INSUFICIENTES', 'NO_CORRESPONDE')) THEN
      UPDATE ia.entrenamiento_categoria SET apto_entrenamiento = false
       WHERE incidencia_paciente_id = NEW.id AND apto_entrenamiento;
    END IF;
  ELSE
    UPDATE ia.entrenamiento_categoria SET apto_entrenamiento = true
     WHERE incidencia_paciente_id = NEW.id AND NOT apto_entrenamiento;
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.fn_marcar_entrenamiento_archivo() IS 'Cuando un caso se archiva con un motivo manual (datos insuficientes o no corresponde) marca sus filas de entrenamiento como no aptas; cuando se reabre, vuelven a ser aptas.';
