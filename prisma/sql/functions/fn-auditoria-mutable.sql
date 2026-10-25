CREATE OR REPLACE FUNCTION public.fn_auditoria_mutable() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_actor text := public.fn_actor();
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.fecha_creacion := now();
    NEW.usuario_creacion := v_actor;
    NEW.fecha_modificacion := now();
    NEW.usuario_modificacion := v_actor;
    NEW.version_fila := 1;
  ELSE
    NEW.fecha_creacion := OLD.fecha_creacion;
    NEW.usuario_creacion := OLD.usuario_creacion;
    NEW.fecha_modificacion := now();
    NEW.usuario_modificacion := v_actor;
    NEW.version_fila := OLD.version_fila + 1;
  END IF;
  RETURN NEW;
END;
$$;
