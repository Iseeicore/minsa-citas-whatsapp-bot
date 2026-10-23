CREATE OR REPLACE FUNCTION public.fn_reglas_incidencia_ins() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.establecimiento_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM catalogo.establecimiento_salud WHERE id = NEW.establecimiento_id AND activo) THEN
    RAISE EXCEPTION 'incidencia_paciente: el establecimiento de origen no existe o esta desactivado'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.area_destino_id IS NOT NULL THEN
    RAISE EXCEPTION 'incidencia_paciente: el area de destino se asigna despues de clasificar, no al crear'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.derivado_en IS NOT NULL OR NEW.derivado_por IS NOT NULL
     OR NEW.tomado_en IS NOT NULL OR NEW.tomado_por IS NOT NULL
     OR NEW.archivado_en IS NOT NULL OR NEW.motivo_archivo_id IS NOT NULL
     OR NEW.reabierto_en IS NOT NULL OR NEW.reabierto_por IS NOT NULL OR NEW.reabierto_motivo IS NOT NULL THEN
    RAISE EXCEPTION 'incidencia_paciente: las fechas y actores de derivacion, toma, archivado y reapertura los llena la base'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_reglas_incidencia_ins() IS 'Al crear una incidencia valida que el establecimiento de origen exista y esté activo, y que nazca sin área de destino ni fechas de derivación, toma, archivado o reapertura.';
