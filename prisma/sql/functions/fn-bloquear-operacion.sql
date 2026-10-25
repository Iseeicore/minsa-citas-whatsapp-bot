CREATE OR REPLACE FUNCTION public.fn_bloquear_operacion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_ARGV[0] = 'todo' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '%.%: la operacion % no esta permitida (%)',
      TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP,
      CASE WHEN TG_ARGV[0] = 'todo' THEN 'tabla de solo insercion' ELSE 'use el borrado logico' END
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
