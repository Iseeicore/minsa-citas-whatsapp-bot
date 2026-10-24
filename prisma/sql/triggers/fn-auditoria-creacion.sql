CREATE OR REPLACE TRIGGER trg_evidencia_b_auditoria_ins BEFORE INSERT ON chatbot.evidencia FOR EACH ROW EXECUTE FUNCTION fn_auditoria_creacion();
CREATE OR REPLACE TRIGGER trg_incidencia_analisis_b_auditoria_ins BEFORE INSERT ON chatbot.incidencia_analisis FOR EACH ROW EXECUTE FUNCTION fn_auditoria_creacion();
CREATE OR REPLACE TRIGGER trg_rol_categoria_b_auditoria_ins BEFORE INSERT ON gestion.rol_categoria FOR EACH ROW EXECUTE FUNCTION fn_auditoria_creacion();
CREATE OR REPLACE TRIGGER trg_usuario_rol_b_auditoria_ins BEFORE INSERT ON gestion.usuario_rol FOR EACH ROW EXECUTE FUNCTION fn_auditoria_creacion();
CREATE OR REPLACE TRIGGER trg_entrenamiento_categoria_b_auditoria_ins BEFORE INSERT ON ia.entrenamiento_categoria FOR EACH ROW EXECUTE FUNCTION fn_auditoria_creacion();
