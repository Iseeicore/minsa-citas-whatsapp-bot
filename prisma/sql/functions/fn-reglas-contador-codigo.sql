CREATE OR REPLACE FUNCTION public.fn_reglas_contador_codigo() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'contador_codigo_incidencia: el contador no se borra' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.anio IS DISTINCT FROM OLD.anio OR NEW.serie IS DISTINCT FROM OLD.serie OR NEW.ultimo < OLD.ultimo THEN
    RAISE EXCEPTION 'contador_codigo_incidencia: el contador solo avanza' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_reglas_contador_codigo() IS 'Impide borrar filas del contador de códigos, cambiar su año o su serie, o bajar el último correlativo.';
