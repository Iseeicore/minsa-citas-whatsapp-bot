CREATE OR REPLACE TRIGGER trg_usuario_rol_a_reglas_ins BEFORE INSERT ON gestion.usuario_rol FOR EACH ROW EXECUTE FUNCTION fn_reglas_usuario_rol();
