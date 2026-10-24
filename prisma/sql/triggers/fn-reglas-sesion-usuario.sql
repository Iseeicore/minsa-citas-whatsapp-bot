CREATE OR REPLACE TRIGGER trg_sesion_usuario_a_reglas_ins BEFORE INSERT ON gestion.sesion_usuario FOR EACH ROW EXECUTE FUNCTION fn_reglas_sesion_usuario();
CREATE OR REPLACE TRIGGER trg_sesion_usuario_a_reglas_upd BEFORE UPDATE ON gestion.sesion_usuario FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION fn_reglas_sesion_usuario();
