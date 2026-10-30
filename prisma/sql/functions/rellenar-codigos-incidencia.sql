CREATE OR REPLACE FUNCTION chatbot.rellenar_codigos_incidencia() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  r record;
  v_total integer := 0;
BEGIN
  PERFORM set_config('app.actor', 'sistema:migracion', true);
  FOR r IN
    SELECT id, fecha_creacion, es_anonimo FROM chatbot.incidencia_paciente WHERE codigo = '' ORDER BY fecha_creacion, id
  LOOP
    UPDATE chatbot.incidencia_paciente SET codigo = chatbot.generar_codigo_incidencia(r.fecha_creacion, r.es_anonimo) WHERE id = r.id;
    v_total := v_total + 1;
  END LOOP;
  RETURN v_total;
END;
$$;

COMMENT ON FUNCTION chatbot.rellenar_codigos_incidencia() IS 'Asigna código a las incidencias que aún no lo tienen, en el orden en que llegaron y en la serie que corresponde a su anonimidad, firmado como sistema:migracion, y devuelve cuántas rellenó. La migración que creó el código la usó una vez; repetirla no cambia nada.';
