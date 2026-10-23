CREATE OR REPLACE FUNCTION public.fn_reglas_incidencia() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_minimo integer := TG_ARGV[0]::integer;
  v_actor text := public.fn_actor();
  v_sensible boolean;
  v_valida boolean;
  v_cantidad integer;
  v_area integer;
  v_motivo smallint;
  v_motivo_codigo text;
  v_archiva boolean := NEW.estado_incidencia_id = 7 AND OLD.estado_incidencia_id <> 7;
  v_reabre boolean := OLD.estado_incidencia_id = 7 AND NEW.estado_incidencia_id <> 7;
BEGIN
  IF v_minimo IS NULL OR v_minimo < 1 THEN
    RAISE EXCEPTION 'fn_reglas_incidencia: el disparador debe recibir como argumento el mínimo de caracteres de los textos obligatorios'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
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

  IF NEW.establecimiento_id IS DISTINCT FROM OLD.establecimiento_id
     AND NOT (OLD.establecimiento_id IS NULL AND v_actor = 'sistema:migracion') THEN
    RAISE EXCEPTION 'incidencia_paciente: el establecimiento de origen no se puede modificar'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.codigo IS DISTINCT FROM OLD.codigo AND OLD.codigo <> '' THEN
    RAISE EXCEPTION 'incidencia_paciente: el codigo lo asigna la base y no se puede modificar'
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

  IF NEW.derivado_en IS DISTINCT FROM OLD.derivado_en
     OR NEW.derivado_por IS DISTINCT FROM OLD.derivado_por
     OR NEW.tomado_en IS DISTINCT FROM OLD.tomado_en
     OR NEW.tomado_por IS DISTINCT FROM OLD.tomado_por
     OR (NEW.archivado_en IS DISTINCT FROM OLD.archivado_en AND NOT v_reabre)
     OR NEW.reabierto_en IS DISTINCT FROM OLD.reabierto_en
     OR NEW.reabierto_por IS DISTINCT FROM OLD.reabierto_por THEN
    RAISE EXCEPTION 'incidencia_paciente: las fechas y actores de derivacion, toma, archivado y reapertura los llena la base'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.motivo_archivo_id IS DISTINCT FROM OLD.motivo_archivo_id
     AND NOT (OLD.motivo_archivo_id IS NULL AND v_archiva) AND NOT v_reabre THEN
    RAISE EXCEPTION 'incidencia_paciente: el motivo de archivo solo se indica al archivar el caso'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.archivo_detalle IS DISTINCT FROM OLD.archivo_detalle AND NOT (OLD.archivo_detalle IS NULL AND v_archiva) AND NOT v_reabre THEN
    RAISE EXCEPTION 'incidencia_paciente: la justificacion del archivo solo se indica al archivar el caso'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.reabierto_motivo IS DISTINCT FROM OLD.reabierto_motivo AND NOT v_reabre THEN
    RAISE EXCEPTION 'incidencia_paciente: el motivo de la reapertura solo se indica al reabrir el caso'
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

  IF OLD.medidas_tomadas IS NOT NULL
     AND (NEW.medidas_tomadas IS DISTINCT FROM OLD.medidas_tomadas
          OR NEW.fundamento IS DISTINCT FROM OLD.fundamento
          OR NEW.resultado_resolucion_id IS DISTINCT FROM OLD.resultado_resolucion_id) THEN
    RAISE EXCEPTION 'incidencia_paciente: la resolucion solo se registra una vez'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.medidas_tomadas IS NULL
     AND (NEW.medidas_tomadas IS NOT NULL OR NEW.fundamento IS NOT NULL OR NEW.resultado_resolucion_id IS NOT NULL) THEN
    IF NEW.medidas_tomadas IS NULL OR NEW.fundamento IS NULL OR NEW.resultado_resolucion_id IS NULL
       OR char_length(btrim(NEW.medidas_tomadas)) < v_minimo OR char_length(btrim(NEW.fundamento)) < v_minimo THEN
      RAISE EXCEPTION 'incidencia_paciente: la resolucion exige las medidas tomadas y el fundamento (% caracteres o mas cada uno) y un resultado', v_minimo
        USING ERRCODE = 'check_violation';
    END IF;
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
         NOT IN ((1, 2), (1, 4), (2, 3), (2, 4), (2, 6), (3, 4), (6, 3), (6, 4), (4, 7), (1, 7), (2, 7), (3, 7), (6, 7), (7, 3)) THEN
    RAISE EXCEPTION 'incidencia_paciente: transicion de estado no permitida (% a %)', OLD.estado_incidencia_id, NEW.estado_incidencia_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_archiva THEN
    v_motivo := NEW.motivo_archivo_id;
    IF v_motivo IS NULL AND NEW.medidas_tomadas IS NOT NULL THEN
      SELECT id INTO v_motivo FROM catalogo.motivo_archivo WHERE codigo = 'RESUELTA_VIGENCIA';
    ELSIF v_motivo IS NULL AND v_actor = 'sistema:vencimiento' THEN
      SELECT id INTO v_motivo FROM catalogo.motivo_archivo WHERE codigo = 'VENCIDA_SIN_ATENDER';
    END IF;
    SELECT codigo INTO v_motivo_codigo FROM catalogo.motivo_archivo WHERE id = v_motivo;
    IF v_motivo_codigo IS NULL THEN
      RAISE EXCEPTION 'incidencia_paciente: archivar un caso exige un motivo de archivo'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_motivo_codigo IN ('DATOS_INSUFICIENTES', 'NO_CORRESPONDE') THEN
      IF OLD.estado_incidencia_id NOT IN (1, 2, 3, 6) THEN
        RAISE EXCEPTION 'incidencia_paciente: un archivado manual solo se hace desde un caso abierto (REGISTRADO, CLASIFICADO, DERIVADO o EN_GESTION)'
          USING ERRCODE = 'check_violation';
      END IF;
      IF NOT (v_actor LIKE 'usuario:%'
              OR (v_motivo_codigo = 'DATOS_INSUFICIENTES' AND v_actor = 'sistema:filtro' AND OLD.estado_incidencia_id IN (1, 2))) THEN
        RAISE EXCEPTION 'incidencia_paciente: un archivado manual (datos insuficientes o no corresponde) lo hace una persona; el filtro del sistema solo archiva por datos insuficientes desde REGISTRADO o CLASIFICADO'
          USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.archivo_detalle IS NULL OR char_length(btrim(NEW.archivo_detalle)) < v_minimo THEN
        RAISE EXCEPTION 'incidencia_paciente: un archivado manual exige una justificacion de % caracteres o mas', v_minimo
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF OLD.estado_incidencia_id IN (1, 2, 3, 6) THEN
      IF v_actor <> 'sistema:vencimiento' THEN
        RAISE EXCEPTION 'incidencia_paciente: un caso abierto solo se archiva por vencimiento del plazo de atencion (lo hace el sistema) o por un motivo manual con justificacion'
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_motivo_codigo <> 'VENCIDA_SIN_ATENDER' THEN
        RAISE EXCEPTION 'incidencia_paciente: el motivo de archivo no corresponde a un caso abierto que vencio'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF v_motivo_codigo <> 'RESUELTA_VIGENCIA' THEN
      RAISE EXCEPTION 'incidencia_paciente: el motivo de archivo no corresponde a un caso resuelto'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.motivo_archivo_id := v_motivo;
    NEW.archivado_en := now();
  END IF;

  IF v_reabre THEN
    SELECT codigo INTO v_motivo_codigo FROM catalogo.motivo_archivo WHERE id = OLD.motivo_archivo_id;
    IF v_motivo_codigo IS NULL OR v_motivo_codigo NOT IN ('DATOS_INSUFICIENTES', 'NO_CORRESPONDE', 'VENCIDA_SIN_ATENDER') THEN
      RAISE EXCEPTION 'incidencia_paciente: solo se reabre un caso archivado por datos insuficientes, porque no corresponde o por vencimiento sin atender'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.reabierto_motivo IS NULL OR char_length(btrim(NEW.reabierto_motivo)) < v_minimo THEN
      RAISE EXCEPTION 'incidencia_paciente: reabrir un caso exige un motivo de % caracteres o mas', v_minimo
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.reabierto_en := now();
    NEW.reabierto_por := v_actor;
    NEW.archivado_en := NULL;
    NEW.motivo_archivo_id := NULL;
    NEW.archivo_detalle := NULL;
  END IF;

  IF NEW.area_destino_id IS DISTINCT FROM OLD.area_destino_id THEN
    IF OLD.estado_incidencia_id NOT IN (2, 6) THEN
      RAISE EXCEPTION 'incidencia_paciente: el area de destino solo se reasigna mientras el caso esta CLASIFICADO o DERIVADO'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.area_destino_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM catalogo.area WHERE id = NEW.area_destino_id AND activo) THEN
      RAISE EXCEPTION 'incidencia_paciente: el area de destino esta desactivada'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.categoria_id IS NOT NULL
     AND (NEW.categoria_id IS DISTINCT FROM OLD.categoria_id OR NEW.area_destino_id IS DISTINCT FROM OLD.area_destino_id) THEN
    SELECT es_sensible INTO v_sensible FROM catalogo.categoria_incidencia WHERE id = NEW.categoria_id;
    IF v_sensible THEN
      v_valida := NEW.area_destino_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM catalogo.area a JOIN catalogo.tipo_area ta ON ta.id = a.tipo_area_id
         WHERE a.id = NEW.area_destino_id AND ta.recibe_sensibles
      );
      IF NOT v_valida THEN
        IF NEW.area_destino_id IS NOT NULL AND NEW.area_destino_id IS DISTINCT FROM OLD.area_destino_id THEN
          RAISE EXCEPTION 'incidencia_paciente: un caso sensible solo se deriva a un area que reciba casos sensibles'
            USING ERRCODE = 'check_violation';
        END IF;
        SELECT count(*), min(a.id) INTO v_cantidad, v_area
          FROM catalogo.area a JOIN catalogo.tipo_area ta ON ta.id = a.tipo_area_id
         WHERE ta.recibe_sensibles AND a.activo AND ta.activo;
        IF v_cantidad = 1 THEN
          NEW.area_destino_id := v_area;
        ELSIF NEW.area_destino_id IS NOT NULL THEN
          RAISE EXCEPTION 'incidencia_paciente: el caso sensible esta en un area que no recibe casos sensibles y no hay una unica area que los reciba'
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;
    END IF;
  END IF;

  IF NEW.categoria_id IS NOT NULL AND NEW.establecimiento_id IS NOT NULL
     AND NOT (SELECT es_sensible FROM catalogo.categoria_incidencia WHERE id = NEW.categoria_id)
     AND ((OLD.categoria_ia_id IS NULL AND NEW.categoria_ia_id IS NOT NULL AND NEW.area_destino_id IS NULL)
          OR (NEW.categoria_id IS DISTINCT FROM OLD.categoria_id AND OLD.estado_incidencia_id IN (1, 2, 6)
              AND (SELECT es_sensible FROM catalogo.categoria_incidencia WHERE id = OLD.categoria_id)
              AND (NEW.area_destino_id IS NULL OR EXISTS (
                     SELECT 1 FROM catalogo.area a JOIN catalogo.tipo_area ta ON ta.id = a.tipo_area_id
                      WHERE a.id = NEW.area_destino_id AND ta.recibe_sensibles)))) THEN
    NEW.area_destino_id := (SELECT area_id FROM catalogo.establecimiento_salud WHERE id = NEW.establecimiento_id);
  END IF;

  IF NEW.estado_incidencia_id IN (3, 6) AND NEW.area_destino_id IS NULL THEN
    RAISE EXCEPTION 'incidencia_paciente: DERIVADO y EN_GESTION exigen un area de destino'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.estado_incidencia_id = 6
     AND (OLD.estado_incidencia_id <> 6 OR NEW.area_destino_id IS DISTINCT FROM OLD.area_destino_id) THEN
    NEW.derivado_en := now();
    NEW.derivado_por := v_actor;
  END IF;
  IF NEW.estado_incidencia_id = 3 AND OLD.estado_incidencia_id <> 3 THEN
    NEW.tomado_en := now();
    NEW.tomado_por := v_actor;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_reglas_incidencia() IS 'Hace cumplir las reglas de la incidencia: datos de origen (incluido el establecimiento) que no cambian, categoría de la IA y su revisión una sola vez, resolución (medidas, fundamento y resultado) una sola vez, máquina de estados, área de destino (obligatoria al derivar o tomar; asignada sola a OTRANS para los casos sensibles y al establecimiento de origen para los demás al clasificarse), motivo y justificación del archivado (automático o manual, con el mínimo de caracteres que recibe como argumento) y reapertura de un caso archivado (con su motivo). Llena las fechas y actores que son de la base.';
