CREATE OR REPLACE FUNCTION auditoria.notificar_revocacion_sesion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM pg_notify('minsa_sesiones_revocadas', encode(sha256(convert_to(NEW.id::text, 'UTF8')), 'hex'));
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION auditoria.notificar_revocacion_sesion() IS 'Al revocarse una sesión avisa por el canal minsa_sesiones_revocadas con la huella SHA256 de su id, nunca el id, para cerrar las conexiones en vivo de esa sesión.';
