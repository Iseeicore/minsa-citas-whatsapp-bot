CREATE OR REPLACE FUNCTION public.fn_historial_incidencia() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_diff jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO chatbot.incidencia_paciente_auditoria (incidencia_paciente_id, operacion, cambios, actor, version_fila)
    VALUES (NEW.id, 'CREACION', to_jsonb(NEW), NEW.usuario_creacion, NEW.version_fila);
  ELSE
    SELECT jsonb_object_agg(n.key, jsonb_build_object('antes', o.value, 'despues', n.value))
      INTO v_diff
      FROM jsonb_each(to_jsonb(NEW)) AS n
      JOIN jsonb_each(to_jsonb(OLD)) AS o ON o.key = n.key
     WHERE n.value IS DISTINCT FROM o.value
       AND n.key NOT IN ('fecha_modificacion', 'usuario_modificacion', 'version_fila');
    IF v_diff IS NOT NULL THEN
      INSERT INTO chatbot.incidencia_paciente_auditoria (incidencia_paciente_id, operacion, cambios, actor, version_fila)
      VALUES (NEW.id, 'ACTUALIZACION', v_diff, NEW.usuario_modificacion, NEW.version_fila);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
