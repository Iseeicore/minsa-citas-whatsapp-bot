CREATE OR REPLACE FUNCTION public.fn_reglas_entrenamiento_categoria() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR (to_jsonb(NEW) - 'apto_entrenamiento') IS DISTINCT FROM (to_jsonb(OLD) - 'apto_entrenamiento')
     OR (NEW.apto_entrenamiento IS DISTINCT FROM OLD.apto_entrenamiento AND pg_trigger_depth() < 2) THEN
    RAISE EXCEPTION '%.%: la operacion % no esta permitida (tabla de solo insercion; apto_entrenamiento solo lo cambia la base al archivar o reabrir el caso)',
      TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_reglas_entrenamiento_categoria() IS 'Hace de solo inserción la tabla de entrenamiento: impide borrar y modificar, salvo apto_entrenamiento, que solo cambia desde el disparador de la incidencia al archivar o reabrir el caso.';
