\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  nombre text;
BEGIN
  FOREACH nombre IN ARRAY ARRAY['chatbot_auditoria_propietario', 'chatbot_auditoria_ingesta', 'chatbot_auditoria_lector'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = nombre) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS', nombre);
    ELSIF EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles
       WHERE rolname = nombre
         AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)
    ) THEN
      RAISE EXCEPTION 'El rol % ya existe con atributos incompatibles con la auditoria', nombre;
    END IF;
  END LOOP;
  FOREACH nombre IN ARRAY ARRAY['chatbot_app_crud', 'chatbot_app_admin'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = nombre) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS', nombre);
    ELSIF EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles
       WHERE rolname = nombre
         AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
    ) THEN
      RAISE EXCEPTION 'El rol % ya existe con atributos de administracion; no se cambia', nombre;
    END IF;
  END LOOP;
END;
$$;

ALTER SCHEMA auditoria OWNER TO chatbot_auditoria_propietario;
ALTER TABLE auditoria.evento OWNER TO chatbot_auditoria_propietario;
ALTER TABLE auditoria.cambio_fila OWNER TO chatbot_auditoria_propietario;
ALTER TABLE auditoria.recurso_accedido OWNER TO chatbot_auditoria_propietario;
ALTER FUNCTION auditoria.validar_objeto(jsonb, text[]) OWNER TO chatbot_auditoria_propietario;
ALTER FUNCTION auditoria.validar_contexto(jsonb, text[]) OWNER TO chatbot_auditoria_propietario;
ALTER FUNCTION auditoria.registrar_evento(jsonb, jsonb) OWNER TO chatbot_auditoria_propietario;
ALTER FUNCTION auditoria.registrar_cambio_fila() OWNER TO chatbot_auditoria_propietario;
ALTER FUNCTION auditoria.rechazar_mutacion() OWNER TO chatbot_auditoria_propietario;
ALTER FUNCTION auditoria.notificar_revocacion_sesion() OWNER TO chatbot_auditoria_propietario;
ALTER FUNCTION auditoria.cerrar_operaciones_interrumpidas(interval, integer) OWNER TO chatbot_auditoria_propietario;
GRANT chatbot_auditoria_propietario TO :"dueno";

REVOKE ALL ON SCHEMA auditoria FROM PUBLIC;
GRANT USAGE ON SCHEMA auditoria TO chatbot_auditoria_ingesta, chatbot_auditoria_lector;
REVOKE ALL ON ALL TABLES IN SCHEMA auditoria FROM PUBLIC, chatbot_auditoria_ingesta, chatbot_auditoria_lector;
GRANT SELECT ON ALL TABLES IN SCHEMA auditoria TO chatbot_auditoria_lector;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA auditoria FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auditoria.registrar_evento(jsonb, jsonb) TO chatbot_auditoria_ingesta;
GRANT EXECUTE ON FUNCTION auditoria.cerrar_operaciones_interrumpidas(interval, integer) TO chatbot_app_crud, chatbot_app_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE chatbot_auditoria_propietario IN SCHEMA auditoria REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE chatbot_auditoria_propietario IN SCHEMA auditoria REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE chatbot_auditoria_propietario IN SCHEMA auditoria GRANT SELECT ON TABLES TO chatbot_auditoria_lector;

GRANT USAGE ON SCHEMA catalogo, chatbot, gestion, ia TO chatbot_app_crud;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA catalogo, chatbot, gestion, ia TO chatbot_app_crud;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA catalogo, chatbot, gestion, ia TO chatbot_app_crud;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA catalogo, chatbot, gestion, ia TO chatbot_app_crud;
GRANT chatbot_auditoria_ingesta TO chatbot_app_crud;
ALTER DEFAULT PRIVILEGES FOR ROLE :"dueno" IN SCHEMA catalogo, chatbot, gestion, ia GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO chatbot_app_crud;
ALTER DEFAULT PRIVILEGES FOR ROLE :"dueno" IN SCHEMA catalogo, chatbot, gestion, ia GRANT USAGE, SELECT ON SEQUENCES TO chatbot_app_crud;
ALTER DEFAULT PRIVILEGES FOR ROLE :"dueno" IN SCHEMA catalogo, chatbot, gestion, ia GRANT EXECUTE ON FUNCTIONS TO chatbot_app_crud;

GRANT USAGE ON SCHEMA catalogo, chatbot, gestion, ia TO chatbot_app_admin WITH GRANT OPTION;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA catalogo, chatbot, gestion, ia TO chatbot_app_admin WITH GRANT OPTION;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA catalogo, chatbot, gestion, ia TO chatbot_app_admin WITH GRANT OPTION;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA catalogo, chatbot, gestion, ia TO chatbot_app_admin WITH GRANT OPTION;
GRANT chatbot_auditoria_ingesta TO chatbot_app_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE :"dueno" IN SCHEMA catalogo, chatbot, gestion, ia GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO chatbot_app_admin WITH GRANT OPTION;
ALTER DEFAULT PRIVILEGES FOR ROLE :"dueno" IN SCHEMA catalogo, chatbot, gestion, ia GRANT USAGE, SELECT ON SEQUENCES TO chatbot_app_admin WITH GRANT OPTION;
ALTER DEFAULT PRIVILEGES FOR ROLE :"dueno" IN SCHEMA catalogo, chatbot, gestion, ia GRANT EXECUTE ON FUNCTIONS TO chatbot_app_admin WITH GRANT OPTION;

COMMIT;
