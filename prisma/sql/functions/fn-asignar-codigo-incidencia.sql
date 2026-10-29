CREATE OR REPLACE FUNCTION public.fn_asignar_codigo_incidencia() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.codigo := chatbot.generar_codigo_incidencia(NEW.fecha_creacion, NEW.es_anonimo);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_asignar_codigo_incidencia() IS 'Al insertar una incidencia le pone su código, en la serie anónima si la incidencia es anónima, y descarta el que haya enviado quien inserta.';
