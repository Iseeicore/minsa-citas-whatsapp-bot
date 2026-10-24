CREATE OR REPLACE FUNCTION public.fn_cerrar_sesiones_usuario() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE gestion.sesion_usuario SET revocada_en = now()
   WHERE usuario_interno_id = NEW.id AND revocada_en IS NULL;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.fn_cerrar_sesiones_usuario() IS 'Al desactivar un usuario interno o cambiarle el área, revoca todas sus sesiones abiertas.';
