CREATE OR REPLACE FUNCTION public.fn_limitar_usuarios_establecimiento() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_tope integer := TG_ARGV[0]::integer;
  v_activos integer;
BEGIN
  IF v_tope IS NULL OR v_tope < 1 THEN
    RAISE EXCEPTION 'fn_limitar_usuarios_establecimiento: el disparador debe recibir como argumento el tope de usuarios activos por establecimiento'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF NOT NEW.activo OR NEW.area_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.area_id IS NOT DISTINCT FROM OLD.area_id AND NEW.activo = OLD.activo AND NEW.eliminado_en IS NOT DISTINCT FROM OLD.eliminado_en THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM catalogo.area a JOIN catalogo.tipo_area ta ON ta.id = a.tipo_area_id
     WHERE a.id = NEW.area_id AND ta.codigo = 'ESTABLECIMIENTO'
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('usuario_interno:tope:' || NEW.area_id::text, 0));
  SELECT count(*) INTO v_activos FROM gestion.usuario_interno WHERE area_id = NEW.area_id AND activo AND id <> NEW.id;
  IF v_activos >= v_tope THEN
    RAISE EXCEPTION 'usuario_interno: el establecimiento ya tiene % usuarios activos', v_tope
      USING ERRCODE = 'check_violation',
            HINT = 'Desactive a un usuario del establecimiento antes de agregar o reactivar otro.';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_limitar_usuarios_establecimiento() IS 'Al insertar un usuario interno, reactivarlo o cambiarle el área, impide que un establecimiento supere el tope de usuarios activos que recibe como argumento (de cualquier rol). Las áreas que no son de un establecimiento, como OTRANS, no tienen tope.';
