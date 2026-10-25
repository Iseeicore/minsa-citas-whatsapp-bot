CREATE OR REPLACE FUNCTION chatbot.generar_codigo_incidencia(p_fecha timestamptz) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_anio integer;
  v_numero integer;
BEGIN
  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'generar_codigo_incidencia: la fecha es obligatoria' USING ERRCODE = 'check_violation';
  END IF;
  v_anio := extract(year FROM p_fecha AT TIME ZONE 'America/Lima')::integer;

  INSERT INTO chatbot.contador_codigo_incidencia AS c (anio, ultimo) VALUES (v_anio, 1)
  ON CONFLICT (anio) DO UPDATE SET ultimo = c.ultimo + 1
  RETURNING c.ultimo INTO v_numero;

  RETURN 'MINSA-' || lpad(v_anio::text, 4, '0') || '-' || repeat('0', greatest(6 - length(v_numero::text), 0)) || v_numero::text;
END;
$$;

COMMENT ON FUNCTION chatbot.generar_codigo_incidencia(timestamp with time zone) IS 'Entrega el siguiente código MINSA-AAAA-NNNNNN para una fecha: el año se toma en la zona America/Lima y el correlativo sale del contador de ese año, que se incrementa dentro de la transacción de quien la llama (si se revierte no se gasta el número y dos transacciones simultáneas esperan su turno). La llama el disparador de inserción de la incidencia.';
