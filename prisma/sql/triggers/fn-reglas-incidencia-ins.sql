CREATE OR REPLACE TRIGGER trg_incidencia_paciente_a_reglas_ins BEFORE INSERT ON chatbot.incidencia_paciente FOR EACH ROW EXECUTE FUNCTION fn_reglas_incidencia_ins();
