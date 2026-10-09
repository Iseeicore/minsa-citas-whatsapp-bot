-- Archivado por vencimiento del plazo de atencion.
--
-- Hasta ahora una incidencia solo se archivaba despues de resuelta (RESUELTO -> ARCHIVADO a los 3 dias). El area usuaria
-- definio ademas que un caso ABIERTO que supera el plazo de atencion, contado desde que llega, tambien pasa a ARCHIVADO.
-- Los dias los fija quien llama a la funcion (por defecto 3): el backend los toma de una variable de entorno.
--
-- Reglas de la incidencia con maquina de estados:
--   REGISTRADO -> CLASIFICADO (lo hace la base cuando la IA asigna la categoria)
--   CLASIFICADO -> DERIVADO (al area competente segun la categoria) o EN_GESTION
--   DERIVADO -> EN_GESTION; EN_GESTION -> RESUELTO (lo hace la base al registrar la resolucion)
--   RESUELTO -> ARCHIVADO (lo hace la funcion de archivado a los 3 dias)
--   REGISTRADO, CLASIFICADO, DERIVADO o EN_GESTION -> ARCHIVADO (solo el sistema, al vencer el plazo de atencion)
-- ANULADO queda retirado: la anulacion es el borrado logico (activo = false).
CREATE OR REPLACE FUNCTION public.fn_reglas_incidencia() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_actor text := public.fn_actor();
BEGIN
  IF NEW.canal_origen_id IS DISTINCT FROM OLD.canal_origen_id
     OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
     OR NEW.mensaje_id IS DISTINCT FROM OLD.mensaje_id
     OR NEW.wa_id IS DISTINCT FROM OLD.wa_id
     OR NEW.es_anonimo IS DISTINCT FROM OLD.es_anonimo
     OR NEW.dni_reclamante IS DISTINCT FROM OLD.dni_reclamante
     OR NEW.nombre_reclamante IS DISTINCT FROM OLD.nombre_reclamante
     OR NEW.descripcion IS DISTINCT FROM OLD.descripcion
     OR NEW.trace_id IS DISTINCT FROM OLD.trace_id THEN
    RAISE EXCEPTION 'incidencia_paciente: los datos de origen no se pueden modificar'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.categoria_asignada_en IS DISTINCT FROM OLD.categoria_asignada_en
     OR NEW.categoria_corregida_en IS DISTINCT FROM OLD.categoria_corregida_en
     OR NEW.categoria_corregida_por IS DISTINCT FROM OLD.categoria_corregida_por
     OR NEW.categoria_confirmada_por IS DISTINCT FROM OLD.categoria_confirmada_por
     OR NEW.resuelto_en IS DISTINCT FROM OLD.resuelto_en
     OR NEW.resuelto_por IS DISTINCT FROM OLD.resuelto_por THEN
    RAISE EXCEPTION 'incidencia_paciente: las fechas y actores de categoria y resolucion los llena la base'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.categoria_ia_id IS NOT NULL
     AND (NEW.categoria_ia_id IS DISTINCT FROM OLD.categoria_ia_id
          OR NEW.categoria_confianza IS DISTINCT FROM OLD.categoria_confianza
          OR NEW.version_clasificador IS DISTINCT FROM OLD.version_clasificador) THEN
    RAISE EXCEPTION 'incidencia_paciente: la categoria, la confianza y la version del clasificador de la IA no se pueden modificar'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.categoria_ia_id IS NULL AND NEW.categoria_ia_id IS NOT NULL THEN
    IF NEW.categoria_id IS NOT NULL AND NEW.categoria_id IS DISTINCT FROM NEW.categoria_ia_id THEN
      RAISE EXCEPTION 'incidencia_paciente: la primera categoria debe ser la que asigna la IA'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.categoria_id := NEW.categoria_ia_id;
    NEW.categoria_asignada_en := now();
    IF OLD.estado_incidencia_id = 1 AND NEW.estado_incidencia_id = 1 THEN
      NEW.estado_incidencia_id := 2;
    END IF;
  ELSIF NEW.categoria_id IS DISTINCT FROM OLD.categoria_id THEN
    IF OLD.categoria_ia_id IS NULL THEN
      RAISE EXCEPTION 'incidencia_paciente: la categoria la asigna primero la IA'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.categoria_id IS NULL THEN
      RAISE EXCEPTION 'incidencia_paciente: la categoria no se puede quitar'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.categoria_confirmada_en IS NOT NULL THEN
      RAISE EXCEPTION 'incidencia_paciente: la categoria ya se confirmo y no se puede corregir'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.categoria_corregida_en IS NOT NULL THEN
      RAISE EXCEPTION 'incidencia_paciente: la categoria ya se corrigio una vez'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.categoria_corregida_en := now();
    NEW.categoria_corregida_por := v_actor;
  END IF;

  IF NEW.categoria_confirmada_en IS DISTINCT FROM OLD.categoria_confirmada_en THEN
    IF OLD.categoria_confirmada_en IS NOT NULL OR NEW.categoria_confirmada_en IS NULL THEN
      RAISE EXCEPTION 'incidencia_paciente: la confirmacion se registra una sola vez y no se quita'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.categoria_ia_id IS NULL THEN
      RAISE EXCEPTION 'incidencia_paciente: no hay categoria de la IA que confirmar'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.categoria_corregida_en IS NOT NULL THEN
      RAISE EXCEPTION 'incidencia_paciente: una categoria corregida no se puede confirmar'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.categoria_confirmada_en := now();
    NEW.categoria_confirmada_por := v_actor;
  END IF;

  IF OLD.medidas_tomadas IS NOT NULL AND NEW.medidas_tomadas IS DISTINCT FROM OLD.medidas_tomadas THEN
    RAISE EXCEPTION 'incidencia_paciente: la resolucion solo se registra una vez'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.medidas_tomadas IS NULL AND NEW.medidas_tomadas IS NOT NULL THEN
    IF NEW.estado_incidencia_id NOT IN (OLD.estado_incidencia_id, 4) THEN
      RAISE EXCEPTION 'incidencia_paciente: al registrar la resolucion el estado pasa a RESUELTO'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.resuelto_en := now();
    NEW.resuelto_por := v_actor;
    NEW.estado_incidencia_id := 4;
  END IF;

  IF NEW.estado_incidencia_id = 4 AND OLD.estado_incidencia_id <> 4 AND NEW.medidas_tomadas IS NULL THEN
    RAISE EXCEPTION 'incidencia_paciente: RESUELTO se alcanza al registrar la resolucion'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.estado_incidencia_id IS DISTINCT FROM OLD.estado_incidencia_id
     AND (OLD.estado_incidencia_id, NEW.estado_incidencia_id)
         NOT IN ((1, 2), (1, 4), (2, 3), (2, 4), (2, 6), (3, 4), (6, 3), (6, 4), (4, 7), (1, 7), (2, 7), (3, 7), (6, 7)) THEN
    RAISE EXCEPTION 'incidencia_paciente: transicion de estado no permitida (% a %)', OLD.estado_incidencia_id, NEW.estado_incidencia_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.estado_incidencia_id = 7 AND OLD.estado_incidencia_id IN (1, 2, 3, 6) AND v_actor <> 'sistema:vencimiento' THEN
    RAISE EXCEPTION 'incidencia_paciente: un caso abierto solo se archiva por vencimiento del plazo de atencion, y lo hace el sistema'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Archivado por vencimiento: pasa a ARCHIVADO un lote de incidencias ABIERTAS (registradas, clasificadas, derivadas o en
-- gestion) que llegaron hace mas de `p_dias` dias (o, si se reabrieron, que se reabrieron hace mas de `p_dias` dias) y
-- devuelve cuantas archivo. Quien la programa la repite hasta que
-- devuelva 0. Se firma como `sistema:vencimiento`: asi el historial distingue este archivado del de las resueltas.
CREATE OR REPLACE FUNCTION chatbot.archivar_incidencias_vencidas(p_dias integer DEFAULT 3, p_lote integer DEFAULT 1000)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_archivadas integer;
BEGIN
  IF p_dias IS NULL OR p_dias < 1 THEN
    RAISE EXCEPTION 'archivar_incidencias_vencidas: los dias deben ser al menos 1'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_lote IS NULL OR p_lote < 1 THEN
    RAISE EXCEPTION 'archivar_incidencias_vencidas: el lote debe ser al menos 1'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.actor', 'sistema:vencimiento', true);

  UPDATE chatbot.incidencia_paciente
     SET estado_incidencia_id = 7
   WHERE id IN (
     SELECT id
       FROM chatbot.incidencia_paciente
      WHERE estado_incidencia_id IN (1, 2, 3, 6)
        AND activo
        AND coalesce(reabierto_en, fecha_creacion) < now() - make_interval(days => p_dias)
      ORDER BY coalesce(reabierto_en, fecha_creacion)
      LIMIT p_lote
        FOR UPDATE SKIP LOCKED
   );
  GET DIAGNOSTICS v_archivadas = ROW_COUNT;
  RETURN v_archivadas;
END;
$$;

COMMENT ON FUNCTION chatbot.archivar_incidencias_vencidas(integer, integer) IS
  'Archiva un lote de incidencias abiertas (registradas, clasificadas, derivadas o en gestión) que llegaron hace más de los días indicados (por defecto 3, el plazo de atención; un caso reabierto cuenta desde su reapertura) y devuelve cuántas archivó. Hay que repetirla hasta que devuelva 0. Quien la programa debe pasar el mismo valor de días que usa el backend. Se firma como sistema:vencimiento.';

SELECT set_config('app.actor', 'sistema:migracion', true);

UPDATE catalogo.estado_incidencia
   SET descripcion = 'Resuelto hace más de la vigencia, o abierto que superó el plazo de atención: archivado automáticamente'
 WHERE codigo = 'ARCHIVADO';

COMMENT ON TABLE catalogo.estado_incidencia IS 'Estados por los que pasa una incidencia: registrado, clasificado (la IA ya asignó categoría), derivado (enviado al área competente), en gestión, resuelto y archivado (a los 3 días de resuelta, o cuando un caso abierto supera el plazo de atención). Anulado está retirado: anular es el borrado lógico. Los valores son provisionales hasta que la unidad usuaria confirme su flujo.';

COMMENT ON COLUMN chatbot.incidencia_paciente.estado_incidencia_id IS 'Estado actual de la incidencia. Nace en REGISTRADO; la base lo pasa a CLASIFICADO cuando la IA asigna la categoría y a RESUELTO cuando se registra la resolución, y solo permite las transiciones definidas. ARCHIVADO se alcanza desde RESUELTO (pasó la vigencia de la resolución) o, solo por el sistema, desde un estado abierto cuyo plazo de atención venció. Los estados CLASIFICADO, EN_GESTION y DERIVADO exigen que la IA ya haya asignado categoría.';
