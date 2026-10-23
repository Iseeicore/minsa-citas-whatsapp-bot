CREATE OR REPLACE FUNCTION public.fn_reglas_archivo_recibido() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.solicitud_carga_id IS DISTINCT FROM OLD.solicitud_carga_id
     OR NEW.nombre_original IS DISTINCT FROM OLD.nombre_original
     OR NEW.mime_declarado IS DISTINCT FROM OLD.mime_declarado
     OR NEW.tamano IS DISTINCT FROM OLD.tamano
     OR NEW.ruta_cuarentena IS DISTINCT FROM OLD.ruta_cuarentena THEN
    RAISE EXCEPTION 'archivo_recibido: los datos de lo que se recibio no se pueden modificar'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.verificado_en IS DISTINCT FROM OLD.verificado_en THEN
    RAISE EXCEPTION 'archivo_recibido: la fecha de verificacion la llena la base'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.estado_archivo_id IN (3, 4) THEN
    IF OLD.estado_archivo_id = 3 AND OLD.evidencia_id IS NULL AND NEW.evidencia_id IS NOT NULL
       AND NEW.estado_archivo_id = OLD.estado_archivo_id
       AND NEW.mime_detectado IS NOT DISTINCT FROM OLD.mime_detectado
       AND NEW.hash_archivo IS NOT DISTINCT FROM OLD.hash_archivo
       AND NEW.motivo_rechazo IS NOT DISTINCT FROM OLD.motivo_rechazo THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'archivo_recibido: un archivo verificado o rechazado ya no cambia'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.estado_archivo_id IS DISTINCT FROM OLD.estado_archivo_id THEN
    IF (OLD.estado_archivo_id, NEW.estado_archivo_id) NOT IN ((1, 2), (1, 4), (2, 1), (2, 3), (2, 4)) THEN
      RAISE EXCEPTION 'archivo_recibido: transicion de estado no permitida (% a %)', OLD.estado_archivo_id, NEW.estado_archivo_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.estado_archivo_id IN (3, 4) THEN
      NEW.verificado_en := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
