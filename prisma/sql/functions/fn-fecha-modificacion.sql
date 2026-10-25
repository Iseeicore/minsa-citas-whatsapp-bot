CREATE OR REPLACE FUNCTION public.fn_fecha_modificacion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.fecha_modificacion := now();
  RETURN NEW;
END;
$$;
