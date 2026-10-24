CREATE OR REPLACE FUNCTION public.fn_reglas_solicitud_carga() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.incidencia_paciente_id IS DISTINCT FROM OLD.incidencia_paciente_id
     AND (OLD.incidencia_paciente_id IS NOT NULL OR NEW.incidencia_paciente_id IS NULL) THEN
    RAISE EXCEPTION 'solicitud_carga: la incidencia se enlaza una sola vez y no se cambia'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.sesion_id IS DISTINCT FROM OLD.sesion_id
     OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
     OR NEW.hash_token IS DISTINCT FROM OLD.hash_token
     OR NEW.vence_en IS DISTINCT FROM OLD.vence_en
     OR NEW.max_archivos IS DISTINCT FROM OLD.max_archivos
     OR NEW.max_bytes_archivo IS DISTINCT FROM OLD.max_bytes_archivo THEN
    RAISE EXCEPTION 'solicitud_carga: los datos de la solicitud no se pueden modificar'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.cerrada_en IS DISTINCT FROM OLD.cerrada_en THEN
    IF OLD.cerrada_en IS NOT NULL OR NEW.cerrada_en IS NULL THEN
      RAISE EXCEPTION 'solicitud_carga: la solicitud se cierra una sola vez y no se reabre'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.cerrada_en := now();
  END IF;

  RETURN NEW;
END;
$$;
