CREATE OR REPLACE FUNCTION catalogo.sumar_dias_habiles(p_desde timestamptz, p_dias integer)
RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE AS $$
DECLARE
  v_dia date := (p_desde AT TIME ZONE 'America/Lima')::date;
  v_dia_semana integer := extract(isodow FROM v_dia)::integer;
  v_base date;
  v_resto integer;
  v_ultimo_habil date;
BEGIN
  IF p_dias < 0 THEN
    RAISE EXCEPTION 'sumar_dias_habiles: los dias no pueden ser negativos'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_dias = 0 THEN
    RETURN (v_dia + 1)::timestamp AT TIME ZONE 'America/Lima';
  END IF;

  v_base := v_dia - greatest(v_dia_semana - 5, 0);
  v_dia_semana := least(v_dia_semana, 5);
  v_resto := p_dias % 5;
  v_ultimo_habil := v_base + 7 * (p_dias / 5) + v_resto
                    + CASE WHEN v_dia_semana + v_resto > 5 THEN 2 ELSE 0 END;

  RETURN (v_ultimo_habil + 1)::timestamp AT TIME ZONE 'America/Lima';
END;
$$;

COMMENT ON FUNCTION catalogo.sumar_dias_habiles(timestamptz, integer) IS 'Devuelve el instante en que vence un plazo de p_dias días hábiles contado desde p_desde. Son hábiles de lunes a viernes (todavía sin feriados), según la fecha de p_desde en la zona America/Lima. Se cuenta desde el día siguiente y el plazo vence al terminar el último día hábil: devuelve las 00:00 (hora de Lima) del día que le sigue. Con 0 días vence al terminar el mismo día. Rechaza días negativos.';
