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

COMMENT ON FUNCTION catalogo.retirar_hospitales_fase_1() IS 'Deshace catalogo.cargar_hospitales_fase_1(): borra solo los 4 hospitales de la primera etapa (6206, 5946, 6215 y 33381) y sus áreas EESS-<renipress>, y las áreas DIRIS-LC y DIRIS-LE únicamente si quedaron sin áreas hijas, usuarios, incidencias ni análisis que las mencionen. Devuelve cuántos hospitales retiró (0 si no estaban cargados, así que se puede repetir). Se niega con restrict_violation y un mensaje que nombra el código y cuántas incidencias, derivaciones y usuarios tiene, sin borrar nada, si alguno de los hospitales ya tiene incidencias, derivaciones o usuarios asociados (activos o no); nunca borra incidencias ni usuarios. No se ejecuta sola: la ejecuta una persona (un DBA) con SELECT catalogo.retirar_hospitales_fase_1(). No usarla cuando los hospitales ya están en operación, y tampoco para quitar establecimientos del padrón completo.';
