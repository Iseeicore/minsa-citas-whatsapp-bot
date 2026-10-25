CREATE OR REPLACE FUNCTION public.fn_reglas_sesion_usuario() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.vence_en <= now() THEN
      RAISE EXCEPTION 'sesion_usuario: no se crea una sesion que ya vencio' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.revocada_en IS NOT NULL THEN
      RAISE EXCEPTION 'sesion_usuario: una sesion nueva no nace revocada' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM gestion.usuario_interno WHERE id = NEW.usuario_interno_id AND activo) THEN
      RAISE EXCEPTION 'sesion_usuario: el usuario esta desactivado' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.usuario_interno_id IS DISTINCT FROM OLD.usuario_interno_id OR NEW.vence_en IS DISTINCT FROM OLD.vence_en THEN
    RAISE EXCEPTION 'sesion_usuario: el usuario y el vencimiento no se pueden modificar' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.revocada_en IS NOT NULL THEN
    RAISE EXCEPTION 'sesion_usuario: una sesion revocada no se modifica' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.ultima_actividad_en < OLD.ultima_actividad_en THEN
    RAISE EXCEPTION 'sesion_usuario: la ultima actividad no puede retroceder' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.revocada_en IS NOT NULL THEN
    NEW.revocada_en := now();
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_reglas_sesion_usuario() IS 'Hace cumplir las reglas de la sesión: nace vigente, sin revocar y para un usuario activo; el usuario y el vencimiento no cambian; la actividad no retrocede; la revocación se registra una sola vez con la fecha de la base y una sesión revocada no se modifica.';
