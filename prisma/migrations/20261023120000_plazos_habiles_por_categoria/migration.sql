BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT set_config('app.actor', 'sistema:migracion', true);

CREATE OR REPLACE FUNCTION catalogo.sumar_dias_habiles(p_desde timestamptz, p_dias integer)
RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE AS $$
DECLARE
  v_dia date := (p_desde AT TIME ZONE 'America/Lima')::date;
  v_dia_semana integer := extract(isodow FROM v_dia)::integer;
  v_base date;
  v_resto integer;
  v_ultimo_habil date;
BEGIN
  IF p_dias < 0 THEN
    RAISE EXCEPTION 'sumar_dias_habiles: los dias no pueden ser negativos'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_dias = 0 THEN
    RETURN (v_dia + 1)::timestamp AT TIME ZONE 'America/Lima';
  END IF;

  v_base := v_dia - greatest(v_dia_semana - 5, 0);
  v_dia_semana := least(v_dia_semana, 5);
  v_resto := p_dias % 5;
  v_ultimo_habil := v_base + 7 * (p_dias / 5) + v_resto
                    + CASE WHEN v_dia_semana + v_resto > 5 THEN 2 ELSE 0 END;

  RETURN (v_ultimo_habil + 1)::timestamp AT TIME ZONE 'America/Lima';
END;
$$;

COMMENT ON FUNCTION catalogo.sumar_dias_habiles(timestamptz, integer) IS
  'Devuelve el instante en que vence un plazo de p_dias días hábiles contado desde p_desde. Son hábiles de lunes a viernes (todavía sin feriados), según la fecha de p_desde en la zona America/Lima. Se cuenta desde el día siguiente y el plazo vence al terminar el último día hábil: devuelve las 00:00 (hora de Lima) del día que le sigue. Con 0 días vence al terminar el mismo día. Rechaza días negativos.';

ALTER TABLE catalogo.categoria_incidencia
  ADD COLUMN IF NOT EXISTS plazo_dias_habiles smallint,
  ADD COLUMN IF NOT EXISTS archiva_por_vencimiento boolean NOT NULL DEFAULT true;

UPDATE catalogo.categoria_incidencia SET plazo_dias_habiles = 30, archiva_por_vencimiento = true
 WHERE codigo IN ('RECLAMO', 'QUEJA', 'OTRO') AND plazo_dias_habiles IS NULL;
UPDATE catalogo.categoria_incidencia SET plazo_dias_habiles = 3, archiva_por_vencimiento = false
 WHERE codigo = 'DENUNCIA_CORRUPCION' AND plazo_dias_habiles IS NULL;

ALTER TABLE catalogo.categoria_incidencia ALTER COLUMN plazo_dias_habiles SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'catalogo.categoria_incidencia'::regclass
       AND conname = 'ck_categoria_incidencia_plazo'
  ) THEN
    ALTER TABLE catalogo.categoria_incidencia
      ADD CONSTRAINT ck_categoria_incidencia_plazo CHECK (plazo_dias_habiles > 0);
  END IF;
END $$;

COMMENT ON COLUMN catalogo.categoria_incidencia.plazo_dias_habiles IS 'Plazo de atención de un caso de esta categoría, en días hábiles (de lunes a viernes, todavía sin feriados, en la zona America/Lima). Se cuenta desde el día siguiente a la llegada del caso, o a su reapertura, y vence al terminar el último día hábil. Mayor que 0.';
COMMENT ON COLUMN catalogo.categoria_incidencia.archiva_por_vencimiento IS 'Verdadero si un caso abierto de esta categoría se archiva solo (motivo VENCIDA_SIN_ATENDER) cuando vence su plazo. Falso (hoy, la denuncia por corrupción) significa que el caso no se archiva por vencimiento aunque supere el plazo.';

CREATE OR REPLACE FUNCTION chatbot.archivar_incidencias_vencidas(p_dias integer DEFAULT 3, p_lote integer DEFAULT 1000)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_archivadas integer;
BEGIN
  IF p_lote IS NULL OR p_lote < 1 THEN
    RAISE EXCEPTION 'archivar_incidencias_vencidas: el lote debe ser al menos 1'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.actor', 'sistema:vencimiento', true);

  UPDATE chatbot.incidencia_paciente
     SET estado_incidencia_id = 7
   WHERE id IN (
     SELECT i.id
       FROM chatbot.incidencia_paciente i
       JOIN catalogo.categoria_incidencia c ON c.id = i.categoria_id
      WHERE i.estado_incidencia_id IN (1, 2, 3, 6)
        AND i.activo
        AND c.archiva_por_vencimiento
        AND now() >= catalogo.sumar_dias_habiles(coalesce(i.reabierto_en, i.fecha_creacion), c.plazo_dias_habiles)
      ORDER BY coalesce(i.reabierto_en, i.fecha_creacion)
      LIMIT p_lote
        FOR UPDATE OF i SKIP LOCKED
   );
  GET DIAGNOSTICS v_archivadas = ROW_COUNT;
  RETURN v_archivadas;
END;
$$;

COMMENT ON FUNCTION chatbot.archivar_incidencias_vencidas(integer, integer) IS
  'Archiva un lote de incidencias abiertas (registradas, clasificadas, derivadas o en gestión) cuyo plazo de atención venció y devuelve cuántas archivó. El plazo es el de la categoría del caso (catalogo.categoria_incidencia.plazo_dias_habiles, en días hábiles, contado desde la llegada o, si se reabrió, desde la reapertura); solo se archivan las categorías con archiva_por_vencimiento y nunca un caso sin categoría. Hay que repetirla hasta que devuelva 0. p_dias se conserva por compatibilidad y se ignora; se quitará en una migración posterior. Se firma como sistema:vencimiento.';

COMMIT;
