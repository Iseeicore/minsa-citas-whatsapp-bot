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
  ASSERT (SELECT count(*) FROM gestion.rol) = 5, 'R01 la tabla de roles tiene los 5 roles finales';
  ASSERT (SELECT activo FROM gestion.rol WHERE codigo = 'DIRIS') = false, 'R01 el rol DIRIS nace desactivado';
  ASSERT (SELECT string_agg(codigo, ',' ORDER BY id) FROM gestion.rol WHERE activo)
         = 'ADMINISTRADOR,GESTOR,OTRANS,ESTABLECIMIENTO', 'R02 los roles vigentes son cuatro';
  ASSERT (SELECT usuario_creacion FROM gestion.rol WHERE codigo = 'DIRIS') = 'sistema:migracion', 'R03 la migracion firma los roles';
  ASSERT NOT EXISTS (SELECT 1 FROM gestion.rol WHERE codigo IN ('REVISOR', 'AREA_DENUNCIA_CORRUPCION', 'AREA_QUEJA', 'AREA_RECLAMO')),
    'R03 los roles de revision y de area por categoria no existen';
  ASSERT to_regclass('gestion.modulo') IS NULL AND to_regclass('gestion.rol_modulo') IS NULL, 'R04 las tablas de modulos no existen';
END $$;

SELECT pg_temp.espera_error($q$UPDATE gestion.rol_categoria SET categoria_incidencia_id = 4 WHERE rol_id = 4 AND categoria_incidencia_id = 2$q$, '23001', 'R05a rol_categoria es de solo insercion: no se modifica');
SELECT pg_temp.espera_error($q$DELETE FROM gestion.rol_categoria WHERE rol_id = 4$q$, '23001', 'R05b rol_categoria es de solo insercion: no se borra');

DO $$
BEGIN
  ASSERT (SELECT descripcion FROM gestion.rol WHERE codigo = 'GESTOR') LIKE '%confirma o la corrige%'
     AND (SELECT descripcion FROM gestion.rol WHERE codigo = 'GESTOR') LIKE '%deriva%'
     AND (SELECT descripcion FROM gestion.rol WHERE codigo = 'GESTOR') LIKE '%no ve las denuncias por corrupción%', 'R06 el gestor revisa y deriva, y no ve corrupcion';
  ASSERT (SELECT descripcion FROM gestion.rol WHERE codigo = 'OTRANS') LIKE '%confirma o corrige%'
     AND (SELECT descripcion FROM gestion.rol WHERE codigo = 'OTRANS') LIKE '%toma directo en gestión%', 'R07 OTRANS revisa y toma directo';
  ASSERT obj_description('gestion.rol'::regclass, 'pg_class') NOT ILIKE '%revisor%', 'R08 el comentario de la tabla de roles no menciona al revisor';
  ASSERT obj_description('gestion.rol_categoria'::regclass, 'pg_class') NOT ILIKE '%revisor%', 'R08 el comentario de rol_categoria no menciona al revisor';
END $$;

DO $$
BEGIN
  ASSERT (SELECT string_agg(r.codigo, ',' ORDER BY r.id) FROM gestion.rol_categoria rc JOIN gestion.rol r ON r.id = rc.rol_id AND r.activo
           WHERE rc.categoria_incidencia_id = 1) = 'ADMINISTRADOR,OTRANS', 'R09 la corrupcion solo la ven el administrador y OTRANS';
  ASSERT (SELECT string_agg(c.codigo, ',' ORDER BY c.id) FROM gestion.rol_categoria rc JOIN gestion.rol r ON r.id = rc.rol_id AND r.activo
            JOIN catalogo.categoria_incidencia c ON c.id = rc.categoria_incidencia_id
           WHERE r.codigo = 'GESTOR') = 'QUEJA,RECLAMO,OTRO', 'R10 el gestor ve queja, reclamo y otro';
END $$;

SELECT set_config('app.actor', 'usuario:admin-prueba', false);
INSERT INTO gestion.usuario_interno (nombre_completo, correo, password_hash) VALUES
  ('Rosa Roles', 'rosa.roles@minsa.gob.pe', '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA');

SELECT pg_temp.espera_error($q$INSERT INTO gestion.usuario_rol (usuario_interno_id, rol_id)
  SELECT id, 5 FROM gestion.usuario_interno WHERE correo = 'rosa.roles@minsa.gob.pe'$q$, '23514', 'R11 no se asigna un rol desactivado (DIRIS)');

INSERT INTO gestion.usuario_rol (usuario_interno_id, rol_id)
SELECT id, r FROM gestion.usuario_interno, unnest(ARRAY[2, 3]) AS r WHERE correo = 'rosa.roles@minsa.gob.pe';

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

SELECT set_config('app.actor', 'usuario:otrans', false);
UPDATE chatbot.incidencia_paciente SET categoria_confirmada_en = now() WHERE trace_id = 'trace-roles-A';
UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3 WHERE trace_id = 'trace-roles-A';

SELECT set_config('app.actor', 'usuario:gestor', false);
UPDATE chatbot.incidencia_paciente SET categoria_id = 1 WHERE trace_id = 'trace-roles-B';

DO $$
DECLARE a chatbot.incidencia_paciente; b chatbot.incidencia_paciente; v_otrans integer := (SELECT id FROM catalogo.area WHERE codigo = 'OTRANS');
BEGIN
  SELECT * INTO a FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-roles-A';
  SELECT * INTO b FROM chatbot.incidencia_paciente WHERE trace_id = 'trace-roles-B';
  ASSERT a.estado_incidencia_id = 3 AND a.categoria_confirmada_por = 'usuario:otrans', 'R13 OTRANS confirma y toma directo, sin derivar';
  ASSERT a.area_destino_id = v_otrans AND a.tomado_por = 'usuario:otrans' AND a.derivado_en IS NULL, 'R13 el caso ya estaba en OTRANS: la toma la firma la base y no hubo derivacion';
  ASSERT b.categoria_id = 1 AND b.categoria_corregida_por = 'usuario:gestor', 'R14 el gestor corrige la categoria';
  ASSERT b.area_destino_id = v_otrans, 'R14 al corregirla a corrupcion la base la asigna a OTRANS';
  ASSERT (SELECT revisado_por || '/' || fue_corregida || '/' || categoria_final_id || '/' || (texto_entrenamiento = a.descripcion)
            FROM ia.entrenamiento_categoria WHERE incidencia_paciente_id = a.id) = 'usuario:otrans/false/1/true',
    'R15 la confirmacion de OTRANS recalibra con el texto del caso';
  ASSERT (SELECT revisado_por || '/' || fue_corregida || '/' || categoria_final_id
            FROM ia.entrenamiento_categoria WHERE incidencia_paciente_id = b.id) = 'usuario:gestor/true/1',
    'R16 la correccion del gestor recalibra';
END $$;

SELECT pg_temp.espera_error($q$UPDATE chatbot.incidencia_paciente SET categoria_id = 2 WHERE trace_id = 'trace-roles-B'$q$, '23514', 'R17 la categoria se corrige una sola vez');

TRUNCATE chatbot.archivo_recibido, chatbot.solicitud_carga, chatbot.evidencia, chatbot.incidencia_paciente_auditoria,
         ia.entrenamiento_categoria, chatbot.incidencia_analisis, chatbot.incidencia_paciente, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion;

\echo TODAS LAS PRUEBAS DE AJUSTE DE ROLES PASARON
