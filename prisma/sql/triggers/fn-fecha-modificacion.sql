CREATE OR REPLACE TRIGGER trg_contador_codigo_incidencia_b_fecha BEFORE UPDATE ON chatbot.contador_codigo_incidencia FOR EACH ROW EXECUTE FUNCTION fn_fecha_modificacion();
CREATE OR REPLACE TRIGGER trg_sesion_conversacion_b_fecha BEFORE UPDATE ON chatbot.sesion_conversacion FOR EACH ROW EXECUTE FUNCTION fn_fecha_modificacion();
