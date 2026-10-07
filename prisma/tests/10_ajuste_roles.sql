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

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM gestion.rol) = 6, 'R01 el revisor no se borra: la tabla conserva los 6 roles';
  ASSERT (SELECT activo FROM gestion.rol WHERE codigo = 'REVISOR') = false, 'R01 el revisor queda desactivado';
  ASSERT (SELECT string_agg(codigo, ',' ORDER BY id) FROM gestion.rol WHERE activo)
         = 'ADMINISTRADOR,GESTOR,AREA_DENUNCIA_CORRUPCION,AREA_QUEJA,AREA_RECLAMO', 'R02 los roles vigentes son cinco';
  ASSERT (SELECT usuario_modificacion FROM gestion.rol WHERE codigo = 'REVISOR') = 'sistema:migracion', 'R03 la migracion firma el retiro';
  ASSERT (SELECT version_fila FROM gestion.rol WHERE codigo = 'REVISOR') = 2, 'R03 el retiro sube la version de la fila';
  ASSERT to_regclass('gestion.modulo') IS NULL AND to_regclass('gestion.rol_modulo') IS NULL, 'R04 las tablas de modulos ya no existen';
  ASSERT (SELECT count(*) FROM gestion.rol_categoria WHERE rol_id = 3) = 4, 'R05 rol_categoria es de solo insercion: las filas del revisor se conservan';
END $$;

DO $$
BEGIN
  ASSERT (SELECT descripcion FROM gestion.rol WHERE codigo = 'GESTOR') LIKE '%confirma o la corrige%'
     AND (SELECT descripcion FROM gestion.rol WHERE codigo = 'GESTOR') LIKE '%deriva%'
     AND (SELECT descripcion FROM gestion.rol WHERE codigo = 'GESTOR') LIKE '%no ve las denuncias por corrupción%', 'R06 el gestor revisa y deriva, y no ve corrupcion';
  ASSERT (SELECT descripcion FROM gestion.rol WHERE codigo = 'AREA_DENUNCIA_CORRUPCION') LIKE '%confirma o corrige%'
     AND (SELECT descripcion FROM gestion.rol WHERE codigo = 'AREA_DENUNCIA_CORRUPCION') LIKE '%toma directo en gestión%', 'R07 el area de corrupcion revisa y toma directo';
  ASSERT obj_description('gestion.rol'::regclass, 'pg_class') NOT LIKE '%gestor, revisor%', 'R08 el comentario de la tabla ya no lista al revisor como rol vigente';
  ASSERT obj_description('gestion.rol_categoria'::regclass, 'pg_class') NOT LIKE '%el administrador y el revisor%', 'R08 el comentario de rol_categoria ya no da corrupcion al revisor';
END $$;

DO $$
BEGIN
  ASSERT (SELECT string_agg(r.codigo, ',' ORDER BY r.id) FROM gestion.rol_categoria rc JOIN gestion.rol r ON r.id = rc.rol_id AND r.activo
           WHERE rc.categoria_incidencia_id = 1) = 'ADMINISTRADOR,AREA_DENUNCIA_CORRUPCION', 'R09 la corrupcion solo la ven el administrador y su area';
  ASSERT (SELECT string_agg(c.codigo, ',' ORDER BY c.id) FROM gestion.rol_categoria rc JOIN gestion.rol r ON r.id = rc.rol_id AND r.activo
            JOIN catalogo.categoria_incidencia c ON c.id = rc.categoria_incidencia_id
           WHERE r.codigo = 'GESTOR') = 'QUEJA,RECLAMO,OTRO', 'R10 el gestor ve queja, reclamo y otro';
END $$;

SELECT set_config('app.actor', 'usuario:admin-prueba', false);
INSERT INTO gestion.usuario_interno (nombre_completo, correo, password_hash) VALUES
  ('Rosa Roles', 'rosa.roles@minsa.gob.pe', '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA');

SELECT pg_temp.espera_error($q$INSERT INTO gestion.usuario_rol (usuario_interno_id, rol_id)
  SELECT id, 3 FROM gestion.usuario_interno WHERE correo = 'rosa.roles@minsa.gob.pe'$q$, '23514', 'R11 no se asigna un rol desactivado');

INSERT INTO gestion.usuario_rol (usuario_interno_id, rol_id)
SELECT id, r FROM gestion.usuario_interno, unnest(ARRAY[2, 4]) AS r WHERE correo = 'rosa.roles@minsa.gob.pe';

DO $$
BEGIN
  ASSERT (SELECT string_agg(DISTINCT c.codigo, ',' ORDER BY c.codigo)
            FROM gestion.usuario_interno u
            JOIN gestion.usuario_rol ur ON ur.usuario_interno_id = u.id
            JOIN gestion.rol r ON r.id = ur.rol_id AND r.activo
            JOIN gestion.rol_categoria rc ON rc.rol_id = r.id
            JOIN catalogo.categoria_incidencia c ON c.id = rc.categoria_incidencia_id
           WHERE u.correo = 'rosa.roles@minsa.gob.pe') = 'DENUNCIA_CORRUPCION,OTRO,QUEJA,RECLAMO', 'R12 un usuario con varios roles ve la union de sus categorias';
END $$;

SELECT set_config('app.actor', 'ciudadano:wa-roles', false);
INSERT INTO chatbot.usuario (wa_id) VALUES ('wa-roles');
INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id)
SELECT 1, id, 'wa-roles', true, 'Caso de roles ' || t, 'trace-roles-' || t FROM chatbot.usuario, unnest(ARRAY['A', 'B']) AS t WHERE wa_id = 'wa-roles';

SELECT set_config('app.actor', 'sistema:ia', false);
UPDATE chatbot.incidencia_paciente SET categoria_ia_id = 1, categoria_confianza = 91, version_clasificador = 'v1' WHERE trace_id = 'trace-roles-A';
UPDATE chatbot.incidencia_paciente SET categoria_ia_id = 3, categoria_confianza = 55, version_clasificador = 'v1' WHERE trace_id = 'trace-roles-B';

SELECT set_config('app.actor', 'usuario:area-corrupcion', false);
UPDATE chatbot.incidencia_paciente SET categoria_confirmada_en = now() WHERE trace_id = 'trace-roles-A';
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3 WHERE trace_id = 'trace-roles-A';

SELECT set_config('app.actor', 'usuario:gestor', false);
UPDATE chatbot.incidencia_paciente SET categoria_id = 1 WHERE trace_id = 'trace-roles-B';

DO $$
DECLARE a chatbot.incidencia_paciente; b chatbot.incidencia_paciente;
BEGIN
  SELECT * INTO a FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-roles-A';
  SELECT * INTO b FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-roles-B';
  ASSERT a.estado_incidencia_id = 3 AND a.categoria_confirmada_por = 'usuario:area-corrupcion', 'R13 el area de corrupcion confirma y toma directo, sin derivar';
  ASSERT b.categoria_id = 1 AND b.categoria_corregida_por = 'usuario:gestor', 'R14 el gestor corrige la categoria';
  ASSERT (SELECT revisado_por || '/' || fue_corregida || '/' || categoria_final_id || '/' || (texto_entrenamiento = a.descripcion)
            FROM ia.entrenamiento_categoria WHERE incidencia_paciente_id = a.id) = 'usuario:area-corrupcion/false/1/true',
    'R15 la confirmacion del area de corrupcion recalibra con el texto del caso';
  ASSERT (SELECT revisado_por || '/' || fue_corregida || '/' || categoria_final_id
            FROM ia.entrenamiento_categoria WHERE incidencia_paciente_id = b.id) = 'usuario:gestor/true/1',
    'R16 la correccion del gestor recalibra';
END $$;

SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET categoria_id = 2 WHERE trace_id = 'trace-roles-B'$q$, '23514', 'R17 la categoria se corrige una sola vez');

\echo TODAS LAS PRUEBAS DE AJUSTE DE ROLES PASARON
