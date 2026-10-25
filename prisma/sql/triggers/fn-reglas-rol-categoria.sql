CREATE OR REPLACE TRIGGER trg_rol_categoria_a_reglas_ins BEFORE INSERT ON gestion.rol_categoria FOR EACH ROW EXECUTE FUNCTION fn_reglas_rol_categoria();
