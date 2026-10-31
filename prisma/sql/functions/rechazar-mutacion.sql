CREATE OR REPLACE FUNCTION auditoria.rechazar_mutacion() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'La evidencia de auditoría es inmutable: % no está permitido', TG_OP USING ERRCODE = '42501';
END;
$$;

COMMENT ON FUNCTION auditoria.rechazar_mutacion() IS 'Rechaza modificar, borrar o vaciar las tablas de auditoría, aunque la sentencia no toque filas.';
