CREATE OR REPLACE TRIGGER trg_contador_codigo_incidencia_a_reglas BEFORE DELETE OR UPDATE ON chatbot.contador_codigo_incidencia FOR EACH ROW EXECUTE FUNCTION fn_reglas_contador_codigo();
