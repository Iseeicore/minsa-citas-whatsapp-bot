CREATE OR REPLACE FUNCTION chatbot.generar_codigo_incidencia(p_fecha timestamptz, p_anonimo boolean) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_anio integer;
  v_serie text;
  v_numero integer;
BEGIN
  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'generar_codigo_incidencia: la fecha es obligatoria' USING ERRCODE = 'check_violation';
  END IF;
  IF p_anonimo IS NULL THEN
    RAISE EXCEPTION 'generar_codigo_incidencia: hay que indicar si la incidencia es anonima' USING ERRCODE = 'check_violation';
  END IF;
  v_anio := extract(year FROM p_fecha AT TIME ZONE 'America/Lima')::integer;
  v_serie := CASE WHEN p_anonimo THEN 'A' ELSE 'N' END;

  INSERT INTO chatbot.contador_codigo_incidencia AS c (anio, serie, ultimo) VALUES (v_anio, v_serie, 1)
  ON CONFLICT (anio, serie) DO UPDATE SET ultimo = c.ultimo + 1
  RETURNING c.ultimo INTO v_numero;

  RETURN 'MINSA-' || lpad(v_anio::text, 4, '0') || '-' || CASE WHEN p_anonimo THEN 'A-' ELSE '' END
    || repeat('0', greatest(6 - length(v_numero::text), 0)) || v_numero::text;
END;
$$;

COMMENT ON FUNCTION chatbot.generar_codigo_incidencia(timestamp with time zone, boolean) IS 'Entrega el siguiente código para una fecha y una anonimidad: MINSA-AAAA-NNNNNN para una incidencia identificada y MINSA-AAAA-A-NNNNNN para una anónima. El año se toma en la zona America/Lima y el correlativo sale del contador de ese año y esa serie (N o A), que se incrementa dentro de la transacción de quien la llama (si se revierte no se gasta el número y dos transacciones simultáneas esperan su turno). Cada serie empieza en 000001 cada año y pasa de 6 dígitos sin cortarse. La llama el disparador de inserción de la incidencia.';
