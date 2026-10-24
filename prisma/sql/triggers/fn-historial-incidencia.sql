CREATE OR REPLACE TRIGGER trg_incidencia_paciente_c_historial AFTER INSERT OR UPDATE ON chatbot.incidencia_paciente FOR EACH ROW EXECUTE FUNCTION fn_historial_incidencia();
