CREATE OR REPLACE FUNCTION auditoria.registrar_cambio_fila() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  contexto jsonb;
  evento uuid;
  anterior jsonb := '{}';
  nuevo jsonb := '{}';
  fila jsonb;
  clave jsonb := '{}';
  valores_anteriores jsonb;
  valores_nuevos jsonb;
  campos text[];
  nombre text;
  permitidos text[] := string_to_array(TG_ARGV[1], ',');
BEGIN
  IF TG_OP <> 'INSERT' THEN anterior := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN nuevo := to_jsonb(NEW); END IF;
  IF anterior = nuevo THEN RETURN NULL; END IF;
  fila := CASE WHEN TG_OP = 'DELETE' THEN anterior ELSE nuevo END;
  FOREACH nombre IN ARRAY string_to_array(TG_ARGV[0], ',') LOOP
    IF TG_TABLE_SCHEMA = 'gestion' AND TG_TABLE_NAME = 'sesion_usuario' AND nombre = 'id' THEN
      clave := clave || jsonb_build_object('sesion_referencia', encode(sha256(convert_to(fila->>nombre, 'UTF8')), 'hex'));
    ELSE
      clave := clave || jsonb_build_object(nombre, fila->nombre);
    END IF;
  END LOOP;
  SELECT coalesce(array_agg(key ORDER BY key), ARRAY[]::text[]) INTO campos
  FROM (SELECT key FROM jsonb_each(anterior) UNION SELECT key FROM jsonb_each(nuevo)) nombres
  WHERE anterior->key IS DISTINCT FROM nuevo->key;
  SELECT coalesce(jsonb_object_agg(key, value), '{}') INTO valores_anteriores
  FROM jsonb_each(anterior) WHERE key = ANY(permitidos) AND key = ANY(campos);
  SELECT coalesce(jsonb_object_agg(key, value), '{}') INTO valores_nuevos
  FROM jsonb_each(nuevo) WHERE key = ANY(permitidos) AND key = ANY(campos);
  contexto := nullif(current_setting('app.auditoria', true), '')::jsonb;
  evento := (contexto->>'evento_id')::uuid;
  IF evento IS NULL THEN
    evento := gen_random_uuid();
    PERFORM auditoria.registrar_evento(jsonb_build_object(
      'id', evento, 'operacion_id', evento, 'origen', 'POSTGRESQL', 'servicio', 'BASE_DATOS',
      'modulo', TG_TABLE_SCHEMA, 'accion', TG_OP, 'fase', 'EJECUCION', 'resultado', 'COMPLETADO',
      'actor_tipo', 'BASE_DATOS', 'actor_id', session_user,
      'recurso_tipo', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
      'contexto_tecnico', jsonb_build_object('principal_bd', session_user)
    ));
  END IF;
  INSERT INTO auditoria.cambio_fila (
    evento_id, esquema, tabla, clave_fila, operacion, campos_modificados,
    valores_anteriores, valores_nuevos, version_resultante, politica_redaccion
  ) VALUES (
    evento, TG_TABLE_SCHEMA, TG_TABLE_NAME, clave, TG_OP, campos,
    valores_anteriores, valores_nuevos, (fila->>'version_fila')::integer, 'DENUNCIAS_CAMPOS_PERMITIDOS_V1'
  );
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION auditoria.registrar_cambio_fila() IS 'Después de insertar, modificar o borrar guarda el cambio en auditoria.cambio_fila, en la misma transacción. Recibe como argumentos las columnas de la clave y las columnas cuyo valor se puede copiar; del resto solo guarda el nombre del campo que cambió. Usa el evento de app.auditoria o, si no hay, crea uno de la conexión (BASE_DATOS) sin inventar un autor.';
