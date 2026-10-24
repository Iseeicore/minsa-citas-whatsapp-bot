CREATE OR REPLACE FUNCTION public.fn_reglas_usuario_rol() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM gestion.rol WHERE id = NEW.rol_id AND activo) THEN
    RAISE EXCEPTION 'usuario_rol: el rol esta desactivado y no se puede asignar' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM gestion.usuario_interno u
      LEFT JOIN catalogo.area a ON a.id = u.area_id
      JOIN gestion.rol r ON r.id = NEW.rol_id
     WHERE u.id = NEW.usuario_interno_id AND r.tipo_area_id IS NOT NULL AND r.tipo_area_id IS DISTINCT FROM a.tipo_area_id
  ) THEN
    RAISE EXCEPTION 'usuario_rol: el tipo de area del rol no coincide con el area del usuario (un rol con tipo de area exige un area de ese tipo)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_reglas_usuario_rol() IS 'Impide asignar un rol desactivado a un usuario interno y un rol con tipo de área a un usuario sin área o con un área de otro tipo.';
