CREATE OR REPLACE TRIGGER trg_archivo_recibido_a_reglas BEFORE UPDATE ON chatbot.archivo_recibido FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION fn_reglas_archivo_recibido();
