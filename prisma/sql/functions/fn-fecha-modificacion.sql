CREATE OR REPLACE FUNCTION public.fn_fecha_modificacion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.fecha_modificacion := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_fecha_modificacion() IS 'Al modificar: actualiza la fecha de modificación.';
