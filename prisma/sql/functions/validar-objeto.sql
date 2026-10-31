CREATE OR REPLACE FUNCTION auditoria.validar_objeto(valor jsonb, claves text[]) RETURNS void
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  elemento record;
BEGIN
  IF jsonb_typeof(valor) IS DISTINCT FROM 'object' OR octet_length(valor::text) > 16384 THEN
    RAISE EXCEPTION 'Objeto de auditoría inválido o demasiado grande' USING ERRCODE = '22023';
  END IF;
  FOR elemento IN SELECT key, value FROM jsonb_each(valor) LOOP
    IF NOT elemento.key = ANY(claves) THEN
      RAISE EXCEPTION 'Campo de auditoría no permitido: %', elemento.key USING ERRCODE = '22023';
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION auditoria.validar_objeto(jsonb, text[]) IS 'Exige que el valor sea un objeto JSON acotado y que solo traiga las claves de la lista permitida; si no, falla con 22023.';
