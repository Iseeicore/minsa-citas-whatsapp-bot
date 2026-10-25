CREATE OR REPLACE FUNCTION public.fn_reglas_rol_categoria() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM gestion.rol r
      JOIN catalogo.tipo_area ta ON ta.id = r.tipo_area_id
      JOIN catalogo.categoria_incidencia c ON c.id = NEW.categoria_incidencia_id
     WHERE r.id = NEW.rol_id AND ta.codigo IN ('ESTABLECIMIENTO', 'DIRIS') AND c.es_sensible
  ) THEN
    RAISE EXCEPTION 'rol_categoria: un rol de establecimiento o de DIRIS no puede ver una categoria sensible'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_reglas_rol_categoria() IS 'Impide dar una categoría sensible a un rol de establecimiento o de DIRIS.';
