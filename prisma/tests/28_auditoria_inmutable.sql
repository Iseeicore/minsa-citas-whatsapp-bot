\set ON_ERROR_STOP on
\set QUIET on

CREATE OR REPLACE FUNCTION pg_temp.espera_error(p_sql text, p_estado text, p_nombre text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = p_estado THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'PRUEBA % FALLO: se esperaba % pero llego % (%)', p_nombre, p_estado, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'PRUEBA % FALLO: la operacion debia fallar con %', p_nombre, p_estado;
END;
$$;

CREATE FUNCTION pg_temp.evento(p_accion text) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'id', '28000000-0000-4000-8000-000000000001', 'operacion_id', '28000000-0000-4000-8000-000000000002',
    'origen', 'API', 'servicio', 'GESTION', 'modulo', 'incidencias', 'accion', p_accion,
    'fase', 'ENTREGA', 'resultado', 'COMPLETADO', 'actor_tipo', 'USUARIO', 'actor_id', 'usuario:ana@minsa.gob.pe',
    'contexto_tecnico', jsonb_build_object('ruta', '/api/v1/incidencias', 'principal_bd', 'otro_usuario'))
$$;

SELECT auditoria.registrar_evento(pg_temp.evento('LISTAR'),
  '[{"recurso_tipo": "incidencia", "recurso_id": "MINSA-2026-000001", "modalidad": "LISTADO", "grupos_datos": ["estado", "categoria"]}]');
SELECT auditoria.registrar_evento(pg_temp.evento('LISTAR'),
  '[{"recurso_tipo": "incidencia", "recurso_id": "MINSA-2026-000001", "modalidad": "LISTADO", "grupos_datos": ["estado", "categoria"]}]');

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM auditoria.evento WHERE operacion_id = '28000000-0000-4000-8000-000000000002') = 1
     AND (SELECT count(*) FROM auditoria.recurso_accedido WHERE evento_id = '28000000-0000-4000-8000-000000000001') = 1,
    'U01 un reintento con el mismo id y contenido devuelve el original sin duplicar el evento ni sus recursos';
  ASSERT (SELECT contexto_tecnico ->> 'principal_bd' = session_user AND registrado_en IS NOT NULL
            FROM auditoria.evento WHERE id = '28000000-0000-4000-8000-000000000001'),
    'U02 el usuario de la base y la fecha de registro los pone PostgreSQL, no quien envia el evento';
END $$;

SELECT pg_temp.espera_error($q$SELECT auditoria.registrar_evento(pg_temp.evento('DESCARGAR'))$q$, '23505', 'U03 el mismo id con otro contenido se rechaza');
SELECT pg_temp.espera_error($q$SELECT auditoria.registrar_evento(pg_temp.evento('LISTAR') || '{"correo": "ana@minsa.gob.pe"}')$q$, '22023', 'U04 una clave fuera de la lista permitida se rechaza');
SELECT pg_temp.espera_error($q$UPDATE auditoria.evento SET accion = 'OTRA'$q$, '42501', 'U05 un evento no se modifica');
SELECT pg_temp.espera_error($q$DELETE FROM auditoria.evento WHERE false$q$, '42501', 'U06 un evento no se borra, ni con un conjunto vacio');
SELECT pg_temp.espera_error($q$TRUNCATE auditoria.recurso_accedido$q$, '42501', 'U07 las tablas de auditoria no se vacian');
SELECT pg_temp.espera_error($q$DELETE FROM auditoria.cambio_fila$q$, '42501', 'U08 un cambio de fila no se borra');

\echo TODAS LAS PRUEBAS DE AUDITORIA INMUTABLE PASARON
