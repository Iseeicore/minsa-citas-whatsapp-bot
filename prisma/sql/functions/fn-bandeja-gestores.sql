CREATE OR REPLACE FUNCTION public.fn_bandeja_gestores() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.habilitado_gestores := false;
  ELSIF NEW.area_destino_id IS DISTINCT FROM OLD.area_destino_id
     OR NEW.categoria_id IS DISTINCT FROM OLD.categoria_id THEN
    NEW.habilitado_gestores := false;
  ELSIF NEW.habilitado_gestores AND NOT OLD.habilitado_gestores THEN
    NEW.derivado_en := now();
    NEW.derivado_por := public.fn_actor();
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_bandeja_gestores() IS 'Corre después de las reglas de la incidencia, sobre la categoría y el área definitivas: un caso nace sin habilitar para la bandeja común de gestores y cualquier cambio de categoría o de área le quita la habilitación; habilitarlo firma la fecha y el actor de la derivación aunque no cambien el estado ni el área.';
