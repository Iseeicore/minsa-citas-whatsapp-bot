CREATE OR REPLACE TRIGGER trg_entrenamiento_categoria_bloqueo BEFORE DELETE OR UPDATE ON ia.entrenamiento_categoria FOR EACH ROW EXECUTE FUNCTION fn_reglas_entrenamiento_categoria();
