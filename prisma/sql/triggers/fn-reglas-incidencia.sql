CREATE OR REPLACE TRIGGER trg_incidencia_paciente_a_reglas BEFORE UPDATE ON chatbot.incidencia_paciente FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION fn_reglas_incidencia(10);
