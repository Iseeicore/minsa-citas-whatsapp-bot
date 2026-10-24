CREATE OR REPLACE TRIGGER trg_incidencia_paciente_b_codigo_ins BEFORE INSERT ON chatbot.incidencia_paciente FOR EACH ROW EXECUTE FUNCTION fn_asignar_codigo_incidencia();
