CREATE OR REPLACE TRIGGER trg_incidencia_paciente_z_bandeja_gestores BEFORE INSERT OR UPDATE ON chatbot.incidencia_paciente FOR EACH ROW EXECUTE FUNCTION fn_bandeja_gestores();
