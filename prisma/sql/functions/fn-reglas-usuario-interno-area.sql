CREATE OR REPLACE FUNCTION public.fn_reglas_usuario_interno_area() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM gestion.usuario_rol ur
      JOIN gestion.rol r ON r.id = ur.rol_id
      LEFT JOIN catalogo.area a ON a.id = NEW.area_id
     WHERE ur.usuario_interno_id = NEW.id AND r.tipo_area_id IS NOT NULL AND r.tipo_area_id IS DISTINCT FROM a.tipo_area_id
  ) THEN
    RAISE EXCEPTION 'usuario_interno: el tipo de area no coincide con el de los roles del usuario (un rol con tipo de area exige un area de ese tipo)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_reglas_usuario_interno_area() IS 'Impide darle a un usuario interno un área cuyo tipo no coincide con el de sus roles que tienen tipo de área, y quitarle el área si tiene alguno de esos roles.';
