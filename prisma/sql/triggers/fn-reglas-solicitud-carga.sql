CREATE OR REPLACE TRIGGER trg_solicitud_carga_a_reglas BEFORE UPDATE ON chatbot.solicitud_carga FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION fn_reglas_solicitud_carga();
