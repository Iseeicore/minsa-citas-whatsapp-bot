CREATE OR REPLACE FUNCTION auditoria.registrar_evento(p_evento jsonb, p_recursos jsonb DEFAULT '[]') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  identificador uuid;
  huella bytea;
  huella_existente bytea;
  recurso jsonb;
  contexto_tecnico jsonb;
BEGIN
  PERFORM auditoria.validar_objeto(p_evento, ARRAY[
    'id', 'version_formato', 'operacion_id', 'peticion_id', 'evento_padre_id', 'evento_autorizacion_id',
    'rectifica_evento_id', 'ocurrido_en', 'origen', 'servicio', 'modulo', 'accion', 'fase', 'resultado',
    'actor_tipo', 'actor_id', 'actor_contexto', 'sujeto_id', 'tipo_autorizacion', 'regla_autorizacion',
    'contexto_autorizacion', 'recurso_tipo', 'recurso_id', 'contexto_tecnico', 'motivo_codigo', 'politica_aplicada', 'detalle'
  ]);
  PERFORM auditoria.validar_contexto(coalesce(p_evento->'actor_contexto', '{}'), ARRAY['roles', 'area_id', 'sesion_referencia']);
  PERFORM auditoria.validar_contexto(coalesce(p_evento->'contexto_autorizacion', '{}'), ARRAY['roles', 'area_id', 'alcance']);
  PERFORM auditoria.validar_contexto(coalesce(p_evento->'contexto_tecnico', '{}'), ARRAY[
    'ip', 'ruta', 'metodo', 'estado_http', 'instancia', 'ambiente', 'version', 'principal_bd'
  ]);
  PERFORM auditoria.validar_contexto(coalesce(p_evento->'politica_aplicada', '{}'), ARRAY[
    'id', 'version', 'algoritmo', 'ambito', 'capacidad', 'ventana_segundos', 'cupo_restante',
    'reintentar_en_segundos', 'fallos', 'bloqueado_hasta'
  ]);
  PERFORM auditoria.validar_contexto(coalesce(p_evento->'detalle', '{}'), ARRAY[
    'cantidad_recursos', 'cantidad_sesiones', 'campos_modificados', 'codigo_error', 'version_contenido', 'grupos_datos'
  ]);
  IF jsonb_typeof(p_recursos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_recursos) > 1000
    OR octet_length(p_recursos::text) > 1048576 THEN
    RAISE EXCEPTION 'Recursos de auditoría inválidos o demasiados' USING ERRCODE = '22023';
  END IF;
  FOR recurso IN SELECT value FROM jsonb_array_elements(p_recursos) LOOP
    PERFORM auditoria.validar_contexto(recurso, ARRAY[
      'recurso_tipo', 'recurso_id', 'version_recurso', 'modalidad', 'grupos_datos', 'manifiesto_id'
    ]);
    IF jsonb_typeof(recurso->'grupos_datos') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Grupos de datos de recurso inválidos' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  identificador := (p_evento->>'id')::uuid;
  huella := sha256(convert_to(jsonb_build_object('evento', p_evento, 'recursos', p_recursos)::text, 'UTF8'));
  contexto_tecnico := coalesce(p_evento->'contexto_tecnico', '{}') || jsonb_build_object('principal_bd', session_user);
  INSERT INTO auditoria.evento (
    id, version_formato, operacion_id, peticion_id, evento_padre_id, evento_autorizacion_id, rectifica_evento_id,
    ocurrido_en, origen, servicio, modulo, accion, fase, resultado, actor_tipo, actor_id, actor_contexto,
    sujeto_id, tipo_autorizacion, regla_autorizacion, contexto_autorizacion, recurso_tipo, recurso_id,
    contexto_tecnico, motivo_codigo, politica_aplicada, detalle, huella_contenido
  ) VALUES (
    identificador, coalesce((p_evento->>'version_formato')::integer, 1), (p_evento->>'operacion_id')::uuid,
    (p_evento->>'peticion_id')::uuid, (p_evento->>'evento_padre_id')::uuid,
    (p_evento->>'evento_autorizacion_id')::uuid, (p_evento->>'rectifica_evento_id')::uuid,
    coalesce((p_evento->>'ocurrido_en')::timestamptz, clock_timestamp()),
    p_evento->>'origen', p_evento->>'servicio', p_evento->>'modulo', p_evento->>'accion', p_evento->>'fase',
    p_evento->>'resultado', p_evento->>'actor_tipo', p_evento->>'actor_id', coalesce(p_evento->'actor_contexto', '{}'),
    p_evento->>'sujeto_id', p_evento->>'tipo_autorizacion', p_evento->>'regla_autorizacion',
    coalesce(p_evento->'contexto_autorizacion', '{}'), p_evento->>'recurso_tipo', p_evento->>'recurso_id',
    contexto_tecnico, p_evento->>'motivo_codigo', coalesce(p_evento->'politica_aplicada', '{}'),
    coalesce(p_evento->'detalle', '{}'), huella
  ) ON CONFLICT (id) DO NOTHING;
  IF NOT FOUND THEN
    SELECT huella_contenido INTO huella_existente FROM auditoria.evento WHERE id = identificador;
    IF huella_existente IS DISTINCT FROM huella THEN
      RAISE EXCEPTION 'El evento % ya existe con contenido diferente', identificador USING ERRCODE = '23505';
    END IF;
    RETURN identificador;
  END IF;
  INSERT INTO auditoria.recurso_accedido (
    evento_id, recurso_tipo, recurso_id, version_recurso, modalidad, grupos_datos, manifiesto_id
  ) SELECT identificador, value->>'recurso_tipo', value->>'recurso_id', value->>'version_recurso',
    value->>'modalidad', ARRAY(SELECT jsonb_array_elements_text(value->'grupos_datos')), value->>'manifiesto_id'
  FROM jsonb_array_elements(p_recursos);
  RETURN identificador;
END;
$$;

COMMENT ON FUNCTION auditoria.registrar_evento(jsonb, jsonb) IS 'Única entrada de ingesta de la auditoría: valida las claves permitidas del evento y de sus recursos, guarda el evento con su huella de contenido y los recursos incluidos, y devuelve su id. Un reintento con el mismo id y contenido devuelve el original; con otro contenido falla con 23505. La fecha de registro y el usuario de la base los pone PostgreSQL.';
