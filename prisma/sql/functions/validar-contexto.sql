CREATE OR REPLACE FUNCTION auditoria.validar_contexto(valor jsonb, claves text[]) RETURNS void
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  elemento record;
BEGIN
  PERFORM auditoria.validar_objeto(valor, claves);
  FOR elemento IN SELECT key, value FROM jsonb_each(valor) LOOP
    IF jsonb_typeof(elemento.value) = 'object' OR octet_length(elemento.value::text) > 2048 THEN
      RAISE EXCEPTION 'Valor de contexto de auditoría no permitido: %', elemento.key USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(elemento.value) = 'array' AND (
      jsonb_array_length(elemento.value) > 100
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(elemento.value) AS item WHERE jsonb_typeof(item) <> 'string' OR length(item #>> '{}') > 120)
    ) THEN
      RAISE EXCEPTION 'Lista de contexto de auditoría no permitida: %', elemento.key USING ERRCODE = '22023';
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION auditoria.validar_contexto(jsonb, text[]) IS 'Valida un contexto de auditoría: objeto con claves permitidas, sin objetos anidados y con listas cortas de textos cortos; si no, falla con 22023.';
