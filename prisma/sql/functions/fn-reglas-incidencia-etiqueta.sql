CREATE OR REPLACE FUNCTION public.fn_reglas_incidencia_etiqueta() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_tope integer := TG_ARGV[0]::integer;
  v_vigentes integer;
  v_repetida boolean;
BEGIN
  IF v_tope IS NULL OR v_tope < 1 THEN
    RAISE EXCEPTION 'fn_reglas_incidencia_etiqueta: el disparador debe recibir como argumento el tope de etiquetas vigentes por incidencia'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.incidencia_paciente_id IS DISTINCT FROM OLD.incidencia_paciente_id OR NEW.etiqueta_id IS DISTINCT FROM OLD.etiqueta_id THEN
      RAISE EXCEPTION 'incidencia_etiqueta: la incidencia y la etiqueta de una asignacion no se pueden modificar'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT OLD.activo THEN
      RAISE EXCEPTION 'incidencia_etiqueta: una asignacion quitada no se modifica ni se reactiva'
        USING ERRCODE = 'check_violation',
              HINT = 'Para volver a poner la etiqueta inserte una asignacion nueva.';
    END IF;
    IF NOT NEW.activo THEN
      NEW.eliminado_en := now();
      NEW.eliminado_por := public.fn_actor();
    END IF;
    RETURN NEW;
  END IF;

  IF NOT NEW.activo OR NEW.eliminado_en IS NOT NULL OR NEW.eliminado_por IS NOT NULL THEN
    RAISE EXCEPTION 'incidencia_etiqueta: una asignacion nace vigente'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM catalogo.etiqueta WHERE id = NEW.etiqueta_id AND NOT activo) THEN
    RAISE EXCEPTION 'incidencia_etiqueta: la etiqueta esta retirada y no se puede asignar'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM chatbot.incidencia_paciente WHERE id = NEW.incidencia_paciente_id AND NOT activo) THEN
    RAISE EXCEPTION 'incidencia_etiqueta: la incidencia esta eliminada y no admite etiquetas nuevas'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('incidencia_etiqueta:tope:' || NEW.incidencia_paciente_id::text, 0));
  SELECT count(*), coalesce(bool_or(etiqueta_id = NEW.etiqueta_id), false)
    INTO v_vigentes, v_repetida
    FROM chatbot.incidencia_etiqueta
   WHERE incidencia_paciente_id = NEW.incidencia_paciente_id AND activo;
  IF v_vigentes >= v_tope AND NOT v_repetida THEN
    RAISE EXCEPTION 'incidencia_etiqueta: la incidencia ya tiene % etiquetas', v_tope
      USING ERRCODE = 'check_violation',
            HINT = 'Quite una etiqueta de la incidencia antes de asignar otra.';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_reglas_incidencia_etiqueta() IS 'Hace cumplir las reglas de la asignación de etiquetas: no se asigna una etiqueta retirada ni a una incidencia eliminada, una incidencia tiene como máximo el tope de etiquetas vigentes que recibe como argumento, la incidencia y la etiqueta de la asignación no cambian, quién y cuándo la quitó lo llena la base y una asignación quitada no se modifica ni se reactiva.';
