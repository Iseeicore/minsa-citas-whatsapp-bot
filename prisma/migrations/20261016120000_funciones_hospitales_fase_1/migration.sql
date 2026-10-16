CREATE OR REPLACE FUNCTION catalogo.cargar_hospitales_fase_1()
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_actor_previo text := coalesce(current_setting('app.actor', true), '');
  v_areas text[];
  v_establecimientos text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM catalogo.nivel_atencion WHERE codigo = 'III')
     OR NOT EXISTS (SELECT 1 FROM catalogo.tipo_area WHERE codigo = 'DIRIS')
     OR NOT EXISTS (SELECT 1 FROM catalogo.tipo_area WHERE codigo = 'ESTABLECIMIENTO') THEN
    RAISE EXCEPTION 'cargar_hospitales_fase_1: faltan el nivel de atencion III o los tipos de area DIRIS y ESTABLECIMIENTO; aplique las migraciones antes'
      USING ERRCODE = 'undefined_object';
  END IF;

  PERFORM set_config('app.actor', 'sistema:carga-hospitales-fase-1', true);

  IF to_regclass('pg_temp.hospitales_fase_1') IS NOT NULL THEN
    DROP TABLE pg_temp.hospitales_fase_1;
  END IF;
  CREATE TEMP TABLE hospitales_fase_1 (
    codigo_renipress text PRIMARY KEY,
    nombre text NOT NULL,
    nivel text NOT NULL,
    categoria text,
    departamento text,
    provincia text,
    distrito text,
    diris_codigo text NOT NULL,
    diris_nombre text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO pg_temp.hospitales_fase_1
    (codigo_renipress, nombre, nivel, categoria, departamento, provincia, distrito, diris_codigo, diris_nombre)
  VALUES
    ('6206', 'HOSPITAL NACIONAL DOS DE MAYO', 'III', NULL, NULL, NULL, NULL, 'DIRIS-LC', 'DIRIS Lima Centro'),
    ('5946', 'Hospital Nacional Hipólito Unanue', 'III', NULL, NULL, NULL, NULL, 'DIRIS-LE', 'DIRIS Lima Este'),
    ('6215', 'HOSPITAL NACIONAL DOCENTE MADRE NIÑO SAN BARTOLOME', 'III', NULL, NULL, NULL, NULL, 'DIRIS-LC', 'DIRIS Lima Centro'),
    ('33381', 'Hospital de Lima Este - Vitarte (III-E)', 'III', 'III-E', NULL, NULL, NULL, 'DIRIS-LE', 'DIRIS Lima Este');

  INSERT INTO catalogo.area (codigo, nombre, tipo_area_id)
  SELECT DISTINCT h.diris_codigo, h.diris_nombre, (SELECT id FROM catalogo.tipo_area WHERE codigo = 'DIRIS')
    FROM pg_temp.hospitales_fase_1 h
  ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, tipo_area_id = EXCLUDED.tipo_area_id
   WHERE (catalogo.area.nombre, catalogo.area.tipo_area_id) IS DISTINCT FROM (EXCLUDED.nombre, EXCLUDED.tipo_area_id);

  WITH cambiadas AS (
    INSERT INTO catalogo.area (codigo, nombre, tipo_area_id, padre_id)
    SELECT 'EESS-' || h.codigo_renipress, h.nombre, (SELECT id FROM catalogo.tipo_area WHERE codigo = 'ESTABLECIMIENTO'), padre.id
      FROM pg_temp.hospitales_fase_1 h
      JOIN catalogo.area padre ON padre.codigo = h.diris_codigo
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, tipo_area_id = EXCLUDED.tipo_area_id, padre_id = EXCLUDED.padre_id
     WHERE (catalogo.area.nombre, catalogo.area.tipo_area_id, catalogo.area.padre_id)
           IS DISTINCT FROM (EXCLUDED.nombre, EXCLUDED.tipo_area_id, EXCLUDED.padre_id)
    RETURNING substr(catalogo.area.codigo, 6) AS codigo_renipress
  )
  SELECT coalesce(array_agg(c.codigo_renipress), ARRAY[]::text[]) INTO v_areas FROM cambiadas c;

  WITH cambiados AS (
    INSERT INTO catalogo.establecimiento_salud
      (codigo_renipress, nombre, nivel_atencion_id, categoria, departamento, provincia, distrito, area_id)
    SELECT h.codigo_renipress, h.nombre, na.id, h.categoria, h.departamento, h.provincia, h.distrito, a.id
      FROM pg_temp.hospitales_fase_1 h
      JOIN catalogo.nivel_atencion na ON na.codigo = h.nivel
      JOIN catalogo.area a ON a.codigo = 'EESS-' || h.codigo_renipress
    ON CONFLICT (codigo_renipress) DO UPDATE
       SET nombre = EXCLUDED.nombre, nivel_atencion_id = EXCLUDED.nivel_atencion_id, categoria = EXCLUDED.categoria,
           departamento = EXCLUDED.departamento, provincia = EXCLUDED.provincia, distrito = EXCLUDED.distrito, area_id = EXCLUDED.area_id
     WHERE (catalogo.establecimiento_salud.nombre, catalogo.establecimiento_salud.nivel_atencion_id, catalogo.establecimiento_salud.categoria,
            catalogo.establecimiento_salud.departamento, catalogo.establecimiento_salud.provincia, catalogo.establecimiento_salud.distrito,
            catalogo.establecimiento_salud.area_id)
           IS DISTINCT FROM (EXCLUDED.nombre, EXCLUDED.nivel_atencion_id, EXCLUDED.categoria,
                             EXCLUDED.departamento, EXCLUDED.provincia, EXCLUDED.distrito, EXCLUDED.area_id)
    RETURNING catalogo.establecimiento_salud.codigo_renipress
  )
  SELECT coalesce(array_agg(c.codigo_renipress), ARRAY[]::text[]) INTO v_establecimientos FROM cambiados c;

  PERFORM set_config('app.actor', v_actor_previo, true);

  RETURN (SELECT count(DISTINCT t.codigo_renipress) FROM unnest(v_areas || v_establecimientos) AS t(codigo_renipress));
END;
$$;

COMMENT ON FUNCTION catalogo.cargar_hospitales_fase_1() IS
  'Carga los 4 hospitales de la primera etapa (códigos RENIPRESS 6206, 5946, 6215 y 33381) con los datos del padrón: las áreas DIRIS Lima Centro y Lima Este, el área EESS-<renipress> de cada hospital como hija de su DIRIS y la fila de establecimiento_salud con su nivel de atención. Devuelve cuántos hospitales creó o corrigió (4 la primera vez, 0 si ya estaban iguales); se puede ejecutar las veces que haga falta, no duplica filas, no toca lo que ya coincide y no deja ruido de auditoría. No se ejecuta sola: ninguna migración ni el arranque de la aplicación la llama, la ejecuta una persona (un DBA) con SELECT catalogo.cargar_hospitales_fase_1(). No usarla para cargar el padrón completo (eso es npm run db:seed:eess) ni sobre una base sin las migraciones aplicadas.';

CREATE OR REPLACE FUNCTION catalogo.retirar_hospitales_fase_1()
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_codigos constant text[] := ARRAY['6206', '5946', '6215', '33381'];
  v_diris constant text[] := ARRAY['DIRIS-LC', 'DIRIS-LE'];
  v_bloqueados text;
  v_retirados integer;
BEGIN
  SELECT string_agg(
           format('%s (incidencias: %s, derivaciones: %s, usuarios: %s)', c.codigo, c.incidencias, c.derivaciones, c.usuarios),
           '; ' ORDER BY c.codigo)
    INTO v_bloqueados
    FROM (
      SELECT h.codigo,
             (SELECT count(*) FROM chatbot.incidencia_paciente i WHERE i.establecimiento_id = e.id) AS incidencias,
             (SELECT count(*) FROM chatbot.incidencia_paciente i WHERE i.area_destino_id = a.id)
               + (SELECT count(*) FROM chatbot.incidencia_analisis n WHERE n.area_mencionada_id = a.id) AS derivaciones,
             (SELECT count(*) FROM gestion.usuario_interno u WHERE u.area_id = a.id) AS usuarios
        FROM unnest(v_codigos) AS h(codigo)
        LEFT JOIN catalogo.establecimiento_salud e ON e.codigo_renipress = h.codigo
        LEFT JOIN catalogo.area a ON a.codigo = 'EESS-' || h.codigo
    ) c
   WHERE c.incidencias + c.derivaciones + c.usuarios > 0;

  IF v_bloqueados IS NOT NULL THEN
    RAISE EXCEPTION 'retirar_hospitales_fase_1: no se retira ningun hospital porque tienen datos asociados: %', v_bloqueados
      USING ERRCODE = 'restrict_violation';
  END IF;

  DELETE FROM catalogo.establecimiento_salud WHERE codigo_renipress = ANY (v_codigos);
  GET DIAGNOSTICS v_retirados = ROW_COUNT;

  DELETE FROM catalogo.area
   WHERE codigo IN (SELECT 'EESS-' || t.codigo FROM unnest(v_codigos) AS t(codigo));

  DELETE FROM catalogo.area a
   WHERE a.codigo = ANY (v_diris)
     AND a.tipo_area_id = (SELECT id FROM catalogo.tipo_area WHERE codigo = 'DIRIS')
     AND NOT EXISTS (SELECT 1 FROM catalogo.area h WHERE h.padre_id = a.id)
     AND NOT EXISTS (SELECT 1 FROM gestion.usuario_interno u WHERE u.area_id = a.id)
     AND NOT EXISTS (SELECT 1 FROM chatbot.incidencia_paciente i WHERE i.area_destino_id = a.id)
     AND NOT EXISTS (SELECT 1 FROM chatbot.incidencia_analisis n WHERE n.area_mencionada_id = a.id);

  RETURN v_retirados;
END;
$$;

COMMENT ON FUNCTION catalogo.retirar_hospitales_fase_1() IS
  'Deshace catalogo.cargar_hospitales_fase_1(): borra solo los 4 hospitales de la primera etapa (6206, 5946, 6215 y 33381) y sus áreas EESS-<renipress>, y las áreas DIRIS-LC y DIRIS-LE únicamente si quedaron sin áreas hijas, usuarios, incidencias ni análisis que las mencionen. Devuelve cuántos hospitales retiró (0 si no estaban cargados, así que se puede repetir). Se niega con restrict_violation y un mensaje que nombra el código y cuántas incidencias, derivaciones y usuarios tiene, sin borrar nada, si alguno de los hospitales ya tiene incidencias, derivaciones o usuarios asociados (activos o no); nunca borra incidencias ni usuarios. No se ejecuta sola: la ejecuta una persona (un DBA) con SELECT catalogo.retirar_hospitales_fase_1(). No usarla cuando los hospitales ya están en operación, y tampoco para quitar establecimientos del padrón completo.';
