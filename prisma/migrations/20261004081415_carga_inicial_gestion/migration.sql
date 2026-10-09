-- AlterTable
ALTER TABLE "catalogo"."categoria_incidencia" ADD COLUMN     "es_sensible" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "gestion"."rol_categoria" (
    "rol_id" SMALLINT NOT NULL,
    "categoria_incidencia_id" SMALLINT NOT NULL,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_rol_categoria" PRIMARY KEY ("rol_id","categoria_incidencia_id")
);

-- AddForeignKey
ALTER TABLE "gestion"."rol_categoria" ADD CONSTRAINT "fk_rol_categoria_rol" FOREIGN KEY ("rol_id") REFERENCES "gestion"."rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gestion"."rol_categoria" ADD CONSTRAINT "fk_rol_categoria_categoria_incidencia" FOREIGN KEY ("categoria_incidencia_id") REFERENCES "catalogo"."categoria_incidencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Los estados CLASIFICADO, EN_GESTION y DERIVADO solo existen si la IA ya asigno una categoria.
ALTER TABLE chatbot.incidencia_paciente
  ADD CONSTRAINT ck_incidencia_paciente_estado
    CHECK (estado_incidencia_id IN (1, 4, 5, 7) OR categoria_ia_id IS NOT NULL);

-- Reglas de la incidencia con maquina de estados:
--   REGISTRADO -> CLASIFICADO (lo hace la base cuando la IA asigna la categoria)
--   CLASIFICADO -> DERIVADO (al area competente segun la categoria) o EN_GESTION
--   DERIVADO -> EN_GESTION; EN_GESTION -> RESUELTO (lo hace la base al registrar la resolucion)
--   RESUELTO -> ARCHIVADO (lo hace la funcion de archivado a los 3 dias)
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
         NOT IN ((1, 2), (1, 4), (2, 3), (2, 4), (2, 6), (3, 4), (6, 3), (6, 4), (4, 7)) THEN
    RAISE EXCEPTION 'incidencia_paciente: transicion de estado no permitida (% a %)', OLD.estado_incidencia_id, NEW.estado_incidencia_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Archivado automatico: pasa a ARCHIVADO un lote de incidencias RESUELTAS hace mas de `p_dias` dias (3 por defecto,
-- la vigencia de la resolucion) y devuelve cuantas archivo. Quien la programa la repite hasta que devuelva 0.
CREATE OR REPLACE FUNCTION chatbot.archivar_incidencias_resueltas(p_dias integer DEFAULT 3, p_lote integer DEFAULT 1000)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_archivadas integer;
BEGIN
  IF p_dias IS NULL OR p_dias < 1 THEN
    RAISE EXCEPTION 'archivar_incidencias_resueltas: los dias deben ser al menos 1'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_lote IS NULL OR p_lote < 1 THEN
    RAISE EXCEPTION 'archivar_incidencias_resueltas: el lote debe ser al menos 1'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.actor', 'sistema:archivado', true);

  UPDATE chatbot.incidencia_paciente
     SET estado_incidencia_id = 7
   WHERE id IN (
     SELECT id
       FROM chatbot.incidencia_paciente
      WHERE estado_incidencia_id = 4
        AND activo
        AND resuelto_en < now() - make_interval(days => p_dias)
      ORDER BY resuelto_en
      LIMIT p_lote
        FOR UPDATE SKIP LOCKED
   );
  GET DIAGNOSTICS v_archivadas = ROW_COUNT;
  RETURN v_archivadas;
END;
$$;

COMMENT ON FUNCTION chatbot.archivar_incidencias_resueltas(integer, integer) IS
  'Archiva un lote de incidencias resueltas hace más de los días indicados (por defecto 3, la vigencia de la resolución) y devuelve cuántas archivó. Hay que repetirla hasta que devuelva 0.';

-- Quien puede ver que categoria de incidencia: solo se inserta (no se modifica ni se borra). Un rol de establecimiento o de
-- DIRIS nunca ve una categoria sensible.
CREATE OR REPLACE FUNCTION public.fn_reglas_rol_categoria() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM gestion.rol r
      JOIN catalogo.tipo_area ta ON ta.id = r.tipo_area_id
      JOIN catalogo.categoria_incidencia c ON c.id = NEW.categoria_incidencia_id
     WHERE r.id = NEW.rol_id AND ta.codigo IN ('ESTABLECIMIENTO', 'DIRIS') AND c.es_sensible
  ) THEN
    RAISE EXCEPTION 'rol_categoria: un rol de establecimiento o de DIRIS no puede ver una categoria sensible'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rol_categoria_a_reglas_ins BEFORE INSERT ON gestion.rol_categoria
  FOR EACH ROW EXECUTE FUNCTION public.fn_reglas_rol_categoria();
CREATE TRIGGER trg_rol_categoria_b_auditoria_ins BEFORE INSERT ON gestion.rol_categoria
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_creacion();
CREATE TRIGGER trg_rol_categoria_bloqueo BEFORE UPDATE OR DELETE ON gestion.rol_categoria
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_operacion('todo');

-- Un rol desactivado no se asigna a nadie, y un rol con tipo de area exige que el usuario tenga un area de ese tipo (el
-- gestor y el responsable de establecimiento pertenecen siempre a un establecimiento; solo el administrador, sin tipo de
-- area, vale en cualquier area o sin ella).
CREATE OR REPLACE FUNCTION public.fn_reglas_usuario_rol() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM gestion.rol WHERE id = NEW.rol_id AND activo) THEN
    RAISE EXCEPTION 'usuario_rol: el rol esta desactivado y no se puede asignar' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM gestion.usuario_interno u
      LEFT JOIN catalogo.area a ON a.id = u.area_id
      JOIN gestion.rol r ON r.id = NEW.rol_id
     WHERE u.id = NEW.usuario_interno_id AND r.tipo_area_id IS NOT NULL AND r.tipo_area_id IS DISTINCT FROM a.tipo_area_id
  ) THEN
    RAISE EXCEPTION 'usuario_rol: el tipo de area del rol no coincide con el area del usuario (un rol con tipo de area exige un area de ese tipo)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_usuario_rol_a_reglas_ins BEFORE INSERT ON gestion.usuario_rol
  FOR EACH ROW EXECUTE FUNCTION public.fn_reglas_usuario_rol();

SELECT set_config('app.actor', 'sistema:migracion', true);

-- Categorias: la denuncia por corrupcion es sensible y se agrega la categoria de salida OTRO.
UPDATE catalogo.categoria_incidencia SET es_sensible = true WHERE codigo = 'DENUNCIA_CORRUPCION';
INSERT INTO catalogo.categoria_incidencia (id, codigo, nombre, descripcion, es_sensible) VALUES
  (4, 'OTRO', 'Otro / no clasificable', 'Texto que no es una denuncia por corrupción, una queja ni un reclamo, o que la IA no puede clasificar con seguridad: una persona decide', false)
ON CONFLICT (id) DO UPDATE
  SET codigo = EXCLUDED.codigo, nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion, es_sensible = EXCLUDED.es_sensible;
SELECT setval(pg_get_serial_sequence('catalogo.categoria_incidencia', 'id'), 4);

-- Estados: ANULADO se retira (es el borrado logico) y se agregan DERIVADO y ARCHIVADO.
UPDATE catalogo.estado_incidencia
   SET activo = false, descripcion = 'Retirado: anular una incidencia es su borrado lógico (activo = false)'
 WHERE codigo = 'ANULADO';
UPDATE catalogo.estado_incidencia SET descripcion = 'El área competente la está atendiendo' WHERE codigo = 'EN_GESTION';
UPDATE catalogo.estado_incidencia SET descripcion = 'Tiene resolución; se archiva a los 3 días' WHERE codigo = 'RESUELTO';
INSERT INTO catalogo.estado_incidencia (id, codigo, nombre, descripcion) VALUES
  (6, 'DERIVADO', 'Derivado', 'Enviado al área competente según su categoría'),
  (7, 'ARCHIVADO', 'Archivado', 'Resuelto hace más de 3 días: archivado automáticamente')
ON CONFLICT (id) DO UPDATE
  SET codigo = EXCLUDED.codigo, nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion;
SELECT setval(pg_get_serial_sequence('catalogo.estado_incidencia', 'id'), 7);

-- Roles de la plataforma de gestion (provisionales hasta que el area usuaria los confirme). Sin usuarios: el primer
-- administrador se crea con un procedimiento aparte, nunca en una migracion. El rol DIRIS nace desactivado.
INSERT INTO gestion.rol (id, codigo, nombre, descripcion, activo, tipo_area_id) VALUES
  (1, 'ADMINISTRADOR', 'Administrador', 'Gestiona usuarios y roles; ve indicadores, métricas y análisis de todos los procesos', true, NULL),
  (2, 'GESTOR', 'Gestor', 'Revisa la categoría que asignó la IA (la confirma o la corrige una sola vez), archiva, reabre y resuelve los casos de su establecimiento; pertenece siempre a un establecimiento y no ve las denuncias por corrupción', true,
    (SELECT id FROM catalogo.tipo_area WHERE codigo = 'ESTABLECIMIENTO')),
  (3, 'OTRANS', 'OTRANS', 'Revisa (confirma o corrige) las denuncias por corrupción, las toma directo en gestión y las resuelve; es la única que las ve, además del administrador', true,
    (SELECT id FROM catalogo.tipo_area WHERE codigo = 'OTRANS')),
  (4, 'ESTABLECIMIENTO', 'Responsable de establecimiento', 'Hace con los casos de su establecimiento lo mismo que el gestor (quejas, reclamos y otros) y, además, gestiona los usuarios de su establecimiento', true,
    (SELECT id FROM catalogo.tipo_area WHERE codigo = 'ESTABLECIMIENTO')),
  (5, 'DIRIS', 'DIRIS', 'Atiende las quejas y los reclamos de los establecimientos de su DIRIS. Desactivado hasta que el área usuaria lo confirme', false,
    (SELECT id FROM catalogo.tipo_area WHERE codigo = 'DIRIS'));
SELECT setval(pg_get_serial_sequence('gestion.rol', 'id'), 5);

-- Quien ve que: OTRANS solo ve las denuncias por corrupcion; el gestor y el responsable de establecimiento ven quejas,
-- reclamos y otros (nunca corrupcion); la DIRIS ve quejas y reclamos.
INSERT INTO gestion.rol_categoria (rol_id, categoria_incidencia_id) VALUES
  (1, 1), (1, 2), (1, 3), (1, 4),
  (2, 2), (2, 3), (2, 4),
  (3, 1),
  (4, 2), (4, 3), (4, 4),
  (5, 2), (5, 3);

-- Descripcion de lo nuevo o cambiado (diccionario de datos dentro de la base).
COMMENT ON COLUMN catalogo.categoria_incidencia.es_sensible IS 'Verdadero si la categoría es sensible (hoy, la denuncia por corrupción): se atiende solo por un área que reciba casos sensibles (OTRANS) y siempre pasa por revisión humana. La base impide derivarla a un establecimiento.';

COMMENT ON TABLE catalogo.categoria_incidencia IS 'Categoría que asigna la IA a una incidencia del paciente: denuncia por corrupción, queja, reclamo u otro (cuando el texto no encaja o la IA no puede clasificarlo con seguridad y decide una persona). Marca cuáles son sensibles. Es un catálogo con llave foránea para poder agregar categorías sin cambiar la estructura.';

COMMENT ON TABLE catalogo.estado_incidencia IS 'Estados por los que pasa una incidencia: registrado, clasificado (la IA ya asignó categoría), derivado (enviado al área competente), en gestión, resuelto y archivado (a los 3 días de resuelta). Anulado está retirado: anular es el borrado lógico. Los valores son provisionales hasta que la unidad usuaria confirme su flujo.';

COMMENT ON COLUMN chatbot.incidencia_paciente.estado_incidencia_id IS 'Estado actual de la incidencia. Nace en REGISTRADO; la base lo pasa a CLASIFICADO cuando la IA asigna la categoría y a RESUELTO cuando se registra la resolución, y solo permite las transiciones definidas (por ejemplo, ARCHIVADO solo desde RESUELTO). Los estados CLASIFICADO, EN_GESTION y DERIVADO exigen que la IA ya haya asignado categoría.';

COMMENT ON TABLE gestion.rol IS 'Rol que puede tener un usuario interno de la plataforma de gestión: administrador, gestor (revisa y atiende los casos de su establecimiento), OTRANS (denuncias por corrupción), establecimiento y DIRIS (esta última desactivada). Un rol desactivado no se asigna a nadie. Si el rol tiene tipo de área (todos menos el administrador), solo lo puede tener un usuario de un área de ese tipo. Es la única plataforma con roles. Los valores son provisionales hasta que el área usuaria los confirme.

Relaciones:
- tipo_area_id → catalogo.tipo_area: Garantiza que el tipo de área del rol sea uno del catálogo. Sirve para exigir que el área del usuario sea de ese tipo.';

COMMENT ON COLUMN gestion.rol_categoria.rol_id IS 'Rol al que se le permite ver la categoría.';

COMMENT ON COLUMN gestion.rol_categoria.categoria_incidencia_id IS 'Categoría de incidencia que el rol puede ver.';

COMMENT ON COLUMN gestion.rol_categoria.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';

COMMENT ON COLUMN gestion.rol_categoria.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';

COMMENT ON TABLE gestion.rol_categoria IS 'Qué categorías de incidencia puede ver cada rol. OTRANS ve solo las denuncias por corrupción (que además solo ve el administrador); el gestor y el establecimiento ven quejas, reclamos y otros; la DIRIS ve quejas y reclamos. La base rechaza dar una categoría sensible a un rol de establecimiento o de DIRIS. Solo se inserta (no se modifica ni se borra); la aplicación aplica la regla al listar.

Relaciones:
- categoria_incidencia_id → catalogo.categoria_incidencia: Garantiza que la categoría sea una del catálogo. Sirve para saber qué roles ven una categoría.
- rol_id → gestion.rol: Cada permiso pertenece a un rol. Sirve para saber qué categorías ve un rol.';

COMMENT ON FUNCTION public.fn_reglas_rol_categoria() IS
  'Impide dar una categoría sensible a un rol de establecimiento o de DIRIS.';

COMMENT ON FUNCTION public.fn_reglas_usuario_rol() IS
  'Impide asignar un rol desactivado a un usuario interno y un rol con tipo de área a un usuario sin área o con un área de otro tipo.';
