CREATE OR REPLACE TRIGGER trg_incidencia_etiqueta_a_reglas_ins BEFORE INSERT ON chatbot.incidencia_etiqueta FOR EACH ROW EXECUTE FUNCTION fn_reglas_incidencia_etiqueta(10);
CREATE OR REPLACE TRIGGER trg_incidencia_etiqueta_a_reglas_upd BEFORE UPDATE ON chatbot.incidencia_etiqueta FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION fn_reglas_incidencia_etiqueta(10);
