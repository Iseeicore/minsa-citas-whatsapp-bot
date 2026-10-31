CREATE OR REPLACE TRIGGER trg_cambio_fila_bloqueo BEFORE UPDATE OR DELETE OR TRUNCATE ON auditoria.cambio_fila FOR EACH STATEMENT EXECUTE FUNCTION auditoria.rechazar_mutacion();
CREATE OR REPLACE TRIGGER trg_evento_bloqueo BEFORE UPDATE OR DELETE OR TRUNCATE ON auditoria.evento FOR EACH STATEMENT EXECUTE FUNCTION auditoria.rechazar_mutacion();
CREATE OR REPLACE TRIGGER trg_recurso_accedido_bloqueo BEFORE UPDATE OR DELETE OR TRUNCATE ON auditoria.recurso_accedido FOR EACH STATEMENT EXECUTE FUNCTION auditoria.rechazar_mutacion();
