-- DropTable
DROP TABLE "gestion"."rol_modulo";

-- DropTable
DROP TABLE "gestion"."modulo";

-- Un rol desactivado no se asigna a nadie: el rol retirado no vuelve a entrar por una asignacion nueva.
CREATE OR REPLACE FUNCTION public.fn_reglas_usuario_rol() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM gestion.rol WHERE id = NEW.rol_id AND activo) THEN
    RAISE EXCEPTION 'usuario_rol: el rol esta desactivado y no se puede asignar' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_usuario_rol_a_reglas_ins BEFORE INSERT ON gestion.usuario_rol
  FOR EACH ROW EXECUTE FUNCTION public.fn_reglas_usuario_rol();

SELECT set_config('app.actor', 'sistema:migracion', true);

-- El revisor se retira (activo = false; rol_categoria y usuario_rol son de solo insercion y no se tocan): confirmar o
-- corregir la categoria pasa al gestor y al area de corrupcion, que revisa sus propios casos.
UPDATE gestion.rol
   SET activo = false,
       descripcion = 'Retirado: confirmar o corregir la categoría pasó al gestor y al área de denuncias por corrupción'
 WHERE codigo = 'REVISOR';

UPDATE gestion.rol
   SET descripcion = 'Revisa la categoría que asignó la IA (la confirma o la corrige una sola vez) y deriva la incidencia al área competente; no ve las denuncias por corrupción'
 WHERE codigo = 'GESTOR';

UPDATE gestion.rol
   SET descripcion = 'Revisa (confirma o corrige) las denuncias por corrupción, las toma directo en gestión y las resuelve; es la única que las ve, además del administrador'
 WHERE codigo = 'AREA_DENUNCIA_CORRUPCION';

COMMENT ON TABLE gestion.rol IS 'Rol que puede tener un usuario interno de la plataforma de gestión: administrador, gestor (revisa y deriva) y una por cada área competente (denuncias por corrupción, quejas y reclamos). El revisor está retirado (activo = false) y no se asigna a nadie. Es la única plataforma con roles. Los valores son provisionales hasta que el área usuaria los confirme.';

COMMENT ON TABLE gestion.rol_categoria IS 'Qué categorías de incidencia puede ver cada rol. Las áreas ven solo su categoría (la de corrupción solo la ven su área y el administrador); el gestor ve lo no sensible para revisarlo y derivarlo. Las filas del rol retirado (revisor) se conservan y no cuentan: solo valen las de roles activos. Solo se inserta; la aplicación aplica la regla al listar.

Relaciones:
- categoria_incidencia_id → catalogo.categoria_incidencia: Garantiza que la categoría sea una del catálogo. Sirve para saber qué roles ven una categoría.
- rol_id → gestion.rol: Cada permiso pertenece a un rol. Sirve para saber qué categorías ve un rol.';

COMMENT ON FUNCTION public.fn_reglas_usuario_rol() IS
  'Impide asignar un rol desactivado a un usuario interno.';
