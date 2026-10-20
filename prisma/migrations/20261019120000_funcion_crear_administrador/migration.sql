CREATE OR REPLACE FUNCTION gestion.crear_administrador(
  p_correo text,
  p_password_hash text,
  p_nombre_completo text DEFAULT 'Administrador'
)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_actor_previo text := coalesce(current_setting('app.actor', true), '');
  v_correo text := lower(btrim(p_correo));
  v_nombre text := btrim(p_nombre_completo);
  v_faltantes text;
  v_rol_id smallint;
  v_usuario_id uuid;
BEGIN
  IF v_correo IS NULL OR v_correo !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'crear_administrador: el correo es obligatorio y debe tener el formato nombre@dominio'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_password_hash IS NULL OR NOT starts_with(p_password_hash, '$argon2id$') THEN
    RAISE EXCEPTION 'crear_administrador: la clave debe llegar como huella Argon2id (empieza con $argon2id$), nunca en texto plano'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF coalesce(v_nombre, '') = '' THEN
    RAISE EXCEPTION 'crear_administrador: el nombre completo no puede estar en blanco; omítalo para usar Administrador'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT string_agg(h.codigo, ', ' ORDER BY h.codigo)
    INTO v_faltantes
    FROM unnest(ARRAY['6206', '5946', '6215', '33381']) AS h(codigo)
   WHERE NOT EXISTS (SELECT 1 FROM catalogo.establecimiento_salud e WHERE e.codigo_renipress = h.codigo);

  IF v_faltantes IS NOT NULL THEN
    RAISE EXCEPTION 'crear_administrador: faltan los hospitales %; ejecute antes SELECT catalogo.cargar_hospitales_fase_1()', v_faltantes
      USING ERRCODE = 'undefined_object';
  END IF;

  SELECT id INTO v_rol_id FROM gestion.rol WHERE codigo = 'ADMINISTRADOR';
  IF v_rol_id IS NULL THEN
    RAISE EXCEPTION 'crear_administrador: falta el rol ADMINISTRADOR; aplique las migraciones antes'
      USING ERRCODE = 'undefined_object';
  END IF;

  PERFORM set_config('app.actor', 'sistema:crear-administrador', true);

  INSERT INTO gestion.usuario_interno (nombre_completo, correo, password_hash)
  VALUES (v_nombre, v_correo, p_password_hash)
  ON CONFLICT (correo) DO NOTHING
  RETURNING id INTO v_usuario_id;

  IF v_usuario_id IS NOT NULL THEN
    INSERT INTO gestion.usuario_rol (usuario_interno_id, rol_id) VALUES (v_usuario_id, v_rol_id);
  END IF;

  PERFORM set_config('app.actor', v_actor_previo, true);

  RETURN CASE WHEN v_usuario_id IS NULL THEN 0 ELSE 1 END;
END;
$$;

COMMENT ON FUNCTION gestion.crear_administrador(text, text, text) IS
  'Crea un usuario con el rol ADMINISTRADOR y sin área a partir de su correo y la huella Argon2id de su clave; el nombre completo es opcional y por defecto es Administrador. Guarda el correo sin espacios y en minúsculas, igual que lo busca el inicio de sesión. Recibe la huella, nunca la clave: PostgreSQL no calcula Argon2 y una clave en texto plano quedaría en los registros de la base; si el valor no empieza con $argon2id$ se niega sin repetirlo. Antes comprueba que estén cargados los 4 hospitales de la primera etapa (códigos RENIPRESS 6206, 5946, 6215 y 33381). Se niega con invalid_parameter_value si un dato no es válido y con undefined_object si faltan hospitales, y en ambos casos no crea nada. Devuelve 1 si lo creó y 0 si el correo ya existía, sin tocar su clave, su estado ni sus roles; se puede ejecutar las veces que haga falta. No se ejecuta sola: ninguna migración ni el arranque de la aplicación la llama, la ejecuta una persona (un DBA) con SELECT gestion.crear_administrador(''correo@dominio'', ''$argon2id$...''), después de SELECT catalogo.cargar_hospitales_fase_1().';
