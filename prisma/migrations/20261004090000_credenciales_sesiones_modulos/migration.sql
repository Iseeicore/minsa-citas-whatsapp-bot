-- AlterTable
ALTER TABLE "gestion"."usuario_interno" ADD COLUMN     "password_hash" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "gestion"."sesion_usuario" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "usuario_interno_id" UUID NOT NULL,
    "ultima_actividad_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vence_en" TIMESTAMPTZ(3) NOT NULL,
    "revocada_en" TIMESTAMPTZ(3),
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_sesion_usuario" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_sesion_usuario_usuario_revocada" ON "gestion"."sesion_usuario"("usuario_interno_id", "revocada_en");

-- AddForeignKey
ALTER TABLE "gestion"."sesion_usuario" ADD CONSTRAINT "fk_sesion_usuario_usuario_interno" FOREIGN KEY ("usuario_interno_id") REFERENCES "gestion"."usuario_interno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Credenciales del usuario interno. La clave nunca se guarda: solo su huella Argon2id (formato PHC). La migracion no crea
-- personas; si una base ya tuviera usuarios internos, agregar las columnas obligatorias falla a proposito.
ALTER TABLE gestion.usuario_interno
  ADD CONSTRAINT ck_usuario_interno_correo_minusculas CHECK (correo = lower(correo)),
  ADD CONSTRAINT ck_usuario_interno_password_hash CHECK (starts_with(password_hash, '$argon2id$'));

-- Reglas de la sesion: se crea vigente y sin revocar para un usuario activo; el usuario y el vencimiento no cambian; la
-- actividad no retrocede; la revocacion se registra una sola vez con la fecha de la base y una sesion revocada no se toca.
CREATE OR REPLACE FUNCTION public.fn_reglas_sesion_usuario() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.vence_en <= now() THEN
      RAISE EXCEPTION 'sesion_usuario: no se crea una sesion que ya vencio' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.revocada_en IS NOT NULL THEN
      RAISE EXCEPTION 'sesion_usuario: una sesion nueva no nace revocada' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM gestion.usuario_interno WHERE id = NEW.usuario_interno_id AND activo) THEN
      RAISE EXCEPTION 'sesion_usuario: el usuario esta desactivado' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.usuario_interno_id IS DISTINCT FROM OLD.usuario_interno_id OR NEW.vence_en IS DISTINCT FROM OLD.vence_en THEN
    RAISE EXCEPTION 'sesion_usuario: el usuario y el vencimiento no se pueden modificar' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.revocada_en IS NOT NULL THEN
    RAISE EXCEPTION 'sesion_usuario: una sesion revocada no se modifica' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.ultima_actividad_en < OLD.ultima_actividad_en THEN
    RAISE EXCEPTION 'sesion_usuario: la ultima actividad no puede retroceder' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.revocada_en IS NOT NULL THEN
    NEW.revocada_en := now();
  END IF;
  RETURN NEW;
END;
$$;

-- Desactivar a un usuario, o cambiarle el area, cierra todas sus sesiones abiertas (el interruptor de apagado vive en la base, no en la aplicacion).
CREATE OR REPLACE FUNCTION public.fn_cerrar_sesiones_usuario() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE gestion.sesion_usuario SET revocada_en = now()
   WHERE usuario_interno_id = NEW.id AND revocada_en IS NULL;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_sesion_usuario_a_reglas_ins BEFORE INSERT ON gestion.sesion_usuario
  FOR EACH ROW EXECUTE FUNCTION public.fn_reglas_sesion_usuario();
CREATE TRIGGER trg_sesion_usuario_a_reglas_upd BEFORE UPDATE ON gestion.sesion_usuario
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.fn_reglas_sesion_usuario();
CREATE TRIGGER trg_sesion_usuario_b_auditoria_ins BEFORE INSERT ON gestion.sesion_usuario
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_mutable();
CREATE TRIGGER trg_sesion_usuario_b_auditoria_upd BEFORE UPDATE ON gestion.sesion_usuario
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.fn_auditoria_mutable();
CREATE TRIGGER trg_sesion_usuario_bloqueo_borrado BEFORE DELETE ON gestion.sesion_usuario
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_operacion('borrado');

CREATE TRIGGER trg_usuario_interno_c_cerrar_sesiones AFTER UPDATE OF activo ON gestion.usuario_interno
  FOR EACH ROW WHEN (OLD.activo AND NOT NEW.activo) EXECUTE FUNCTION public.fn_cerrar_sesiones_usuario();

-- Cambiar el area de un usuario tambien cierra sus sesiones (los permisos se calculan con el area) y el usuario debe tener
-- un area del mismo tipo que sus roles con tipo de area (gestor, establecimiento, OTRANS): quitarle el area tambien se
-- rechaza. Solo el administrador, sin tipo de area, vale en cualquier area o sin ella.
CREATE OR REPLACE FUNCTION public.fn_reglas_usuario_interno_area() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM gestion.usuario_rol ur
      JOIN gestion.rol r ON r.id = ur.rol_id
      LEFT JOIN catalogo.area a ON a.id = NEW.area_id
     WHERE ur.usuario_interno_id = NEW.id AND r.tipo_area_id IS NOT NULL AND r.tipo_area_id IS DISTINCT FROM a.tipo_area_id
  ) THEN
    RAISE EXCEPTION 'usuario_interno: el tipo de area no coincide con el de los roles del usuario (un rol con tipo de area exige un area de ese tipo)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Tope de usuarios por establecimiento: como maximo 3 usuarios ACTIVOS (de cualquier rol) en el area de un establecimiento.
-- Se hace cumplir al insertar un usuario, al reactivarlo y al cambiarle el area; el area OTRANS (y cualquier area que no
-- sea de un establecimiento) no tiene tope. Una modificacion que no toca el area ni la vigencia no se revisa. Los
-- insertos y cambios simultaneos del mismo establecimiento esperan su turno (cerrojo por area dentro de la transaccion).
CREATE OR REPLACE FUNCTION public.fn_limitar_usuarios_establecimiento() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_tope CONSTANT integer := 3;
  v_activos integer;
BEGIN
  IF NOT NEW.activo OR NEW.area_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.area_id IS NOT DISTINCT FROM OLD.area_id AND NEW.activo = OLD.activo AND NEW.eliminado_en IS NOT DISTINCT FROM OLD.eliminado_en THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM catalogo.area a JOIN catalogo.tipo_area ta ON ta.id = a.tipo_area_id
     WHERE a.id = NEW.area_id AND ta.codigo = 'ESTABLECIMIENTO'
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('usuario_interno:tope:' || NEW.area_id::text, 0));
  SELECT count(*) INTO v_activos FROM gestion.usuario_interno WHERE area_id = NEW.area_id AND activo AND id <> NEW.id;
  IF v_activos >= v_tope THEN
    RAISE EXCEPTION 'usuario_interno: el establecimiento ya tiene 3 usuarios activos'
      USING ERRCODE = 'check_violation',
            HINT = 'Desactive a un usuario del establecimiento antes de agregar o reactivar otro.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_usuario_interno_a_tope_ins BEFORE INSERT ON gestion.usuario_interno
  FOR EACH ROW EXECUTE FUNCTION public.fn_limitar_usuarios_establecimiento();
CREATE TRIGGER trg_usuario_interno_a_tope_upd BEFORE UPDATE OF area_id, activo, eliminado_en ON gestion.usuario_interno
  FOR EACH ROW EXECUTE FUNCTION public.fn_limitar_usuarios_establecimiento();

CREATE TRIGGER trg_usuario_interno_a_reglas_area BEFORE UPDATE OF area_id ON gestion.usuario_interno
  FOR EACH ROW WHEN (OLD.area_id IS DISTINCT FROM NEW.area_id) EXECUTE FUNCTION public.fn_reglas_usuario_interno_area();

CREATE TRIGGER trg_usuario_interno_c_cerrar_sesiones_area AFTER UPDATE OF area_id ON gestion.usuario_interno
  FOR EACH ROW WHEN (OLD.area_id IS DISTINCT FROM NEW.area_id) EXECUTE FUNCTION public.fn_cerrar_sesiones_usuario();

SELECT set_config('app.actor', 'sistema:migracion', true);

-- Descripcion de lo nuevo o cambiado (diccionario de datos dentro de la base).
COMMENT ON COLUMN gestion.usuario_interno.correo IS 'Correo institucional, siempre en minúscula. Es único y es lo que la persona escribe para iniciar sesión.';

COMMENT ON COLUMN gestion.usuario_interno.password_hash IS 'Huella Argon2id de la clave, en formato PHC (empieza con $argon2id$). Nunca se guarda la clave; la base rechaza cualquier valor que no tenga ese formato.';

COMMENT ON TABLE gestion.usuario_interno IS 'Persona de la institución que gestiona los casos. Es distinta del usuario de WhatsApp. Inicia sesión con su correo y su clave: de la clave solo se guarda su huella Argon2id. Nunca se borra: se desactiva, y al desactivarla o cambiarle el área se cierran todas sus sesiones. Un establecimiento puede tener como máximo 3 usuarios activos.';

COMMENT ON COLUMN gestion.sesion_usuario.id IS 'Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación.';

COMMENT ON COLUMN gestion.sesion_usuario.usuario_interno_id IS 'Usuario interno dueño de la sesión. No cambia.';

COMMENT ON COLUMN gestion.sesion_usuario.ultima_actividad_en IS 'Fecha y hora (UTC) de la última petición con esta sesión. La aplicación la actualiza para calcular el vencimiento por inactividad; no puede retroceder.';

COMMENT ON COLUMN gestion.sesion_usuario.vence_en IS 'Fecha y hora (UTC) en que la sesión vence de forma absoluta, aunque haya actividad. Se fija al crearla y no cambia.';

COMMENT ON COLUMN gestion.sesion_usuario.revocada_en IS 'Fecha y hora (UTC) en que se cerró la sesión (cierre del usuario, cierre por un administrador o desactivación del usuario). La fija la base una sola vez; nulo mientras está abierta.';

COMMENT ON COLUMN gestion.sesion_usuario.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';

COMMENT ON COLUMN gestion.sesion_usuario.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';

COMMENT ON COLUMN gestion.sesion_usuario.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';

COMMENT ON COLUMN gestion.sesion_usuario.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';

COMMENT ON COLUMN gestion.sesion_usuario.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';

COMMENT ON TABLE gestion.sesion_usuario IS 'Sesión abierta por un usuario interno. Su id es lo único que viaja en la cookie (firmada): ni roles ni datos de la persona salen de la base. La base impide crearla vencida o para un usuario desactivado, fija la fecha de revocación y cierra todas las sesiones de un usuario cuando se desactiva. No se borra: queda como historial de accesos.

Relaciones:
- usuario_interno_id → gestion.usuario_interno: Cada sesión pertenece a un usuario interno. Sirve para listar o cerrar todas las sesiones de una persona.';

COMMENT ON FUNCTION public.fn_reglas_sesion_usuario() IS
  'Hace cumplir las reglas de la sesión: nace vigente, sin revocar y para un usuario activo; el usuario y el vencimiento no cambian; la actividad no retrocede; la revocación se registra una sola vez con la fecha de la base y una sesión revocada no se modifica.';

COMMENT ON FUNCTION public.fn_cerrar_sesiones_usuario() IS
  'Al desactivar un usuario interno o cambiarle el área, revoca todas sus sesiones abiertas.';

COMMENT ON FUNCTION public.fn_reglas_usuario_interno_area() IS
  'Impide darle a un usuario interno un área cuyo tipo no coincide con el de sus roles que tienen tipo de área, y quitarle el área si tiene alguno de esos roles.';

COMMENT ON FUNCTION public.fn_limitar_usuarios_establecimiento() IS
  'Al insertar un usuario interno, reactivarlo o cambiarle el área, impide que un establecimiento tenga más de 3 usuarios activos (de cualquier rol). Las áreas que no son de un establecimiento, como OTRANS, no tienen tope.';
