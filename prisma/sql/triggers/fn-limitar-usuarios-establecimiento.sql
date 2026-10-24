CREATE OR REPLACE TRIGGER trg_usuario_interno_a_tope_ins BEFORE INSERT ON gestion.usuario_interno FOR EACH ROW EXECUTE FUNCTION fn_limitar_usuarios_establecimiento(3);
CREATE OR REPLACE TRIGGER trg_usuario_interno_a_tope_upd BEFORE UPDATE OF area_id, activo, eliminado_en ON gestion.usuario_interno FOR EACH ROW EXECUTE FUNCTION fn_limitar_usuarios_establecimiento(3);
