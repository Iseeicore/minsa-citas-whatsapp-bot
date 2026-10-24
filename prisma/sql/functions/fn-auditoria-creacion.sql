CREATE OR REPLACE FUNCTION public.fn_auditoria_creacion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.fecha_creacion := now();
  NEW.usuario_creacion := public.fn_actor();
  RETURN NEW;
END;
$$;
