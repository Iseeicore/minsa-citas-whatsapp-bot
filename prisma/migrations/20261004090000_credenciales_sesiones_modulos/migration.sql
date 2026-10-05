-- AlterTable
ALTER TABLE "gestion"."usuario_interno" ADD COLUMN     "password_hash" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "gestion"."modulo" (
    "id" SMALLSERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_modulo" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gestion"."rol_modulo" (
    "rol_id" SMALLINT NOT NULL,
    "modulo_id" SMALLINT NOT NULL,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_rol_modulo" PRIMARY KEY ("rol_id","modulo_id")
);

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
CREATE UNIQUE INDEX "uq_modulo_codigo" ON "gestion"."modulo"("codigo");

-- CreateIndex
CREATE INDEX "ix_sesion_usuario_usuario_revocada" ON "gestion"."sesion_usuario"("usuario_interno_id", "revocada_en");

-- AddForeignKey
ALTER TABLE "gestion"."rol_modulo" ADD CONSTRAINT "fk_rol_modulo_rol" FOREIGN KEY ("rol_id") REFERENCES "gestion"."rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gestion"."rol_modulo" ADD CONSTRAINT "fk_rol_modulo_modulo" FOREIGN KEY ("modulo_id") REFERENCES "gestion"."modulo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

-- Desactivar a un usuario cierra todas sus sesiones abiertas (el interruptor de apagado vive en la base, no en la aplicacion).
CREATE OR REPLACE FUNCTION public.fn_cerrar_sesiones_usuario() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE gestion.sesion_usuario SET revocada_en = now()
   WHERE usuario_interno_id = NEW.id AND revocada_en IS NULL;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_modulo_b_auditoria_ins BEFORE INSERT ON gestion.modulo
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_mutable();
CREATE TRIGGER trg_modulo_b_auditoria_upd BEFORE UPDATE ON gestion.modulo
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.fn_auditoria_mutable();

CREATE TRIGGER trg_rol_modulo_b_auditoria_ins BEFORE INSERT ON gestion.rol_modulo
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_creacion();

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

SELECT set_config('app.actor', 'sistema:migracion', true);

-- Modulos de la plataforma de gestion. El acceso se da por modulo: un rol abre los modulos que tiene asignados.
INSERT INTO gestion.modulo (id, codigo, nombre, descripcion) VALUES
  (1, 'INCIDENCIAS', 'Incidencias', 'Visor de las incidencias de los pacientes, con su detalle, historial y evidencias'),
  (2, 'REVISION', 'Revisión y resolución', 'Corregir o confirmar la categoría, derivar al área y registrar la resolución'),
  (3, 'INDICADORES', 'Indicadores', 'Métricas y análisis de los procesos: ingresos del día, resueltas, por vencer y desempeño de la IA'),
  (4, 'ENTRENAMIENTO_IA', 'Entrenamiento de la IA', 'Correcciones y confirmaciones que alimentan la mejora del clasificador, y su exactitud por versión'),
  (5, 'USUARIOS', 'Usuarios y roles', 'Alta, desactivación y asignación de roles de los usuarios internos')
ON CONFLICT (id) DO UPDATE
  SET codigo = EXCLUDED.codigo, nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion;
SELECT setval(pg_get_serial_sequence('gestion.modulo', 'id'), 5);

-- Que modulos abre cada rol (provisional, igual que los roles). Que categorias ve sigue en gestion.rol_categoria.
INSERT INTO gestion.rol_modulo (rol_id, modulo_id) VALUES
  (1, 1), (1, 2), (1, 3), (1, 4), (1, 5),
  (2, 1), (2, 2),
  (3, 1), (3, 2), (3, 4),
  (4, 1), (4, 2),
  (5, 1), (5, 2),
  (6, 1), (6, 2)
ON CONFLICT (rol_id, modulo_id) DO NOTHING;


-- Descripcion de lo nuevo o cambiado (diccionario de datos dentro de la base).
COMMENT ON COLUMN gestion.usuario_interno.correo IS 'Correo institucional, siempre en minúscula. Es único y es lo que la persona escribe para iniciar sesión.';

COMMENT ON COLUMN gestion.usuario_interno.password_hash IS 'Huella Argon2id de la clave, en formato PHC (empieza con $argon2id$). Nunca se guarda la clave; la base rechaza cualquier valor que no tenga ese formato.';

COMMENT ON TABLE gestion.usuario_interno IS 'Persona de la institución que gestiona los casos. Es distinta del usuario de WhatsApp. Inicia sesión con su correo y su clave: de la clave solo se guarda su huella Argon2id. Nunca se borra: se desactiva, y al desactivarla se cierran todas sus sesiones.';

COMMENT ON COLUMN gestion.modulo.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';

COMMENT ON COLUMN gestion.modulo.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';

COMMENT ON COLUMN gestion.modulo.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';

COMMENT ON COLUMN gestion.modulo.descripcion IS 'Explicación opcional de qué significa el valor.';

COMMENT ON COLUMN gestion.modulo.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';

COMMENT ON COLUMN gestion.modulo.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';

COMMENT ON COLUMN gestion.modulo.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';

COMMENT ON COLUMN gestion.modulo.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';

COMMENT ON COLUMN gestion.modulo.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';

COMMENT ON COLUMN gestion.modulo.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';

COMMENT ON TABLE gestion.modulo IS 'Módulo (pantalla o capacidad) de la plataforma de gestión: incidencias, revisión y resolución, indicadores, entrenamiento de la IA y usuarios y roles. El acceso se da por módulo: un rol abre los módulos que tiene asignados. Los valores son provisionales hasta que el área usuaria los confirme.';

COMMENT ON COLUMN gestion.rol_modulo.rol_id IS 'Rol al que se le permite abrir el módulo.';

COMMENT ON COLUMN gestion.rol_modulo.modulo_id IS 'Módulo que el rol puede abrir.';

COMMENT ON COLUMN gestion.rol_modulo.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';

COMMENT ON COLUMN gestion.rol_modulo.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';

COMMENT ON TABLE gestion.rol_modulo IS 'Qué módulos abre cada rol. Un usuario abre la unión de los módulos de todos sus roles. Solo se inserta; el backend consulta esta relación en cada petición a partir de la sesión, sin enviar roles ni módulos al navegador.

Relaciones:
- modulo_id → gestion.modulo: Garantiza que el módulo sea uno del catálogo. Sirve para saber qué roles abren un módulo.
- rol_id → gestion.rol: Cada permiso de módulo pertenece a un rol. Sirve para saber qué módulos abre un rol.';

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
  'Al desactivar un usuario interno, revoca todas sus sesiones abiertas.';
