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

-- Permisos de categoria por rol (lo que siembra la migracion)
DO $$
BEGIN
  ASSERT (SELECT string_agg(r.codigo || ':' || c.codigo, ',' ORDER BY r.id, c.id)
            FROM gestion.rol_categoria rc JOIN gestion.rol r ON r.id = rc.rol_id JOIN catalogo.categoria_incidencia c ON c.id = rc.categoria_incidencia_id)
         = 'ADMINISTRADOR:DENUNCIA_CORRUPCION,ADMINISTRADOR:QUEJA,ADMINISTRADOR:RECLAMO,ADMINISTRADOR:OTRO,'
           'GESTOR:QUEJA,GESTOR:RECLAMO,GESTOR:OTRO,'
           'OTRANS:DENUNCIA_CORRUPCION,'
           'ESTABLECIMIENTO:QUEJA,ESTABLECIMIENTO:RECLAMO,ESTABLECIMIENTO:OTRO,'
           'DIRIS:QUEJA,DIRIS:RECLAMO',
    'G01 permisos exactos de cada rol';
END $$;

SELECT set_config('app.actor', 'usuario:admin-13', false);

SELECT pg_temp.espera_error($q$INSERT INTO gestion.rol_categoria (rol_id, categoria_incidencia_id) SELECT r.id, 1 FROM gestion.rol r WHERE r.codigo = 'ESTABLECIMIENTO'$q$, '23514', 'G02 un establecimiento no puede ver corrupcion');
SELECT pg_temp.espera_error($q$INSERT INTO gestion.rol_categoria (rol_id, categoria_incidencia_id) SELECT r.id, 1 FROM gestion.rol r WHERE r.codigo = 'DIRIS'$q$, '23514', 'G03 la DIRIS no puede ver corrupcion');
SELECT pg_temp.espera_error($q$UPDATE gestion.rol_categoria SET categoria_incidencia_id = 4 WHERE rol_id = 3$q$, '23001', 'G04 los permisos no se modifican');
SELECT pg_temp.espera_error($q$DELETE FROM gestion.rol_categoria WHERE rol_id = 3$q$, '23001', 'G05 los permisos no se borran');
SELECT pg_temp.espera_error($q$INSERT INTO gestion.rol (codigo, nombre, tipo_area_id) VALUES ('X', 'X', 99)$q$, '23503', 'G06 el tipo de area del rol debe existir');

-- Areas y usuarios de la prueba
INSERT INTO catalogo.area (codigo, nombre, tipo_area_id) VALUES
  ('T13-EESS-A', 'Establecimiento A', 1),
  ('T13-EESS-B', 'Establecimiento B', 1),
  ('T13-DIRIS', 'DIRIS de prueba 13', 3);

INSERT INTO gestion.usuario_interno (nombre_completo, correo, password_hash, area_id)
SELECT v.nombre, v.correo, '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA', a.id
  FROM (VALUES ('Eva Establecimiento', 'g.eva@minsa.gob.pe', 'T13-EESS-A'),
               ('Omar OTRANS', 'g.omar@minsa.gob.pe', 'OTRANS'),
               ('Dora DIRIS', 'g.dora@minsa.gob.pe', 'T13-DIRIS'),
               ('Ana Administradora', 'g.ana@minsa.gob.pe', 'T13-EESS-A')) AS v(nombre, correo, area)
  JOIN catalogo.area a ON a.codigo = v.area;

CREATE FUNCTION pg_temp.dar_rol(p_correo text, p_rol text) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO gestion.usuario_rol (usuario_interno_id, rol_id)
  SELECT u.id, r.id FROM gestion.usuario_interno u, gestion.rol r WHERE u.correo = p_correo AND r.codigo = p_rol;
$$;

-- El tipo de area del rol debe coincidir con el del area del usuario
SELECT pg_temp.dar_rol('g.eva@minsa.gob.pe', 'ESTABLECIMIENTO');
SELECT pg_temp.dar_rol('g.omar@minsa.gob.pe', 'OTRANS');
SELECT pg_temp.dar_rol('g.ana@minsa.gob.pe', 'ADMINISTRADOR');
SELECT pg_temp.dar_rol('g.ana@minsa.gob.pe', 'GESTOR');
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM gestion.usuario_rol ur JOIN gestion.usuario_interno u ON u.id = ur.usuario_interno_id WHERE u.correo IN ('g.eva@minsa.gob.pe', 'g.omar@minsa.gob.pe', 'g.ana@minsa.gob.pe')) = 4,
    'G07 el rol coincide con el tipo de area: el gestor en un establecimiento y el administrador donde sea';
END $$;

SELECT pg_temp.espera_error($q$SELECT pg_temp.dar_rol('g.eva@minsa.gob.pe', 'OTRANS')$q$, '23514', 'G08 un usuario de establecimiento no recibe el rol OTRANS');
SELECT pg_temp.espera_error($q$SELECT pg_temp.dar_rol('g.omar@minsa.gob.pe', 'ESTABLECIMIENTO')$q$, '23514', 'G09 un usuario de OTRANS no recibe el rol de establecimiento');
SELECT pg_temp.espera_error($q$SELECT pg_temp.dar_rol('g.dora@minsa.gob.pe', 'ESTABLECIMIENTO')$q$, '23514', 'G10 un usuario de una DIRIS no recibe el rol de establecimiento');
SELECT pg_temp.espera_error($q$SELECT pg_temp.dar_rol('g.dora@minsa.gob.pe', 'DIRIS')$q$, '23514', 'G11 el rol DIRIS esta desactivado: no se asigna ni a un usuario de una DIRIS');

-- El gestor (como cualquier rol con tipo de area) exige un area del tipo de su rol
INSERT INTO gestion.usuario_interno (nombre_completo, correo, password_hash, area_id) VALUES
  ('Sin Area', 'g.sinarea@minsa.gob.pe', '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA', NULL);
INSERT INTO gestion.usuario_interno (nombre_completo, correo, password_hash, area_id)
SELECT 'Gestor Mal Ubicado', 'g.malubicado@minsa.gob.pe', '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA', a.id FROM catalogo.area a WHERE a.codigo = 'T13-DIRIS';
INSERT INTO gestion.usuario_interno (nombre_completo, correo, password_hash, area_id)
SELECT 'Gestor En Otrans', 'g.engotrans@minsa.gob.pe', '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA', a.id FROM catalogo.area a WHERE a.codigo = 'OTRANS';
SELECT pg_temp.espera_error($q$SELECT pg_temp.dar_rol('g.sinarea@minsa.gob.pe', 'GESTOR')$q$, '23514', 'G12 un gestor sin area no es valido');
SELECT pg_temp.espera_error($q$SELECT pg_temp.dar_rol('g.sinarea@minsa.gob.pe', 'ESTABLECIMIENTO')$q$, '23514', 'G13 un usuario de establecimiento sin area tampoco');
SELECT pg_temp.espera_error($q$SELECT pg_temp.dar_rol('g.sinarea@minsa.gob.pe', 'OTRANS')$q$, '23514', 'G14 ni uno de OTRANS');
SELECT pg_temp.espera_error($q$SELECT pg_temp.dar_rol('g.malubicado@minsa.gob.pe', 'GESTOR')$q$, '23514', 'G15 un gestor en el area de una DIRIS no es valido');
SELECT pg_temp.espera_error($q$SELECT pg_temp.dar_rol('g.engotrans@minsa.gob.pe', 'GESTOR')$q$, '23514', 'G16 un gestor en OTRANS no es valido');
SELECT pg_temp.dar_rol('g.sinarea@minsa.gob.pe', 'ADMINISTRADOR');
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM gestion.usuario_rol ur JOIN gestion.usuario_interno u ON u.id = ur.usuario_interno_id WHERE u.correo = 'g.sinarea@minsa.gob.pe') = 1,
    'G17 el administrador si puede existir sin area';
END $$;
SELECT pg_temp.espera_error($q$UPDATE gestion.usuario_interno SET area_id = NULL WHERE correo = 'g.ana@minsa.gob.pe'$q$, '23514', 'G18 quitarle el area a quien es gestor se rechaza');

-- Cambiar el area cierra las sesiones y respeta el tipo de area de los roles
INSERT INTO gestion.sesion_usuario (usuario_interno_id, vence_en)
SELECT u.id, now() + interval '8 hours' FROM gestion.usuario_interno u, generate_series(1, 3) WHERE u.correo = 'g.eva@minsa.gob.pe';
INSERT INTO gestion.sesion_usuario (usuario_interno_id, vence_en)
SELECT u.id, now() + interval '8 hours' FROM gestion.usuario_interno u WHERE u.correo = 'g.omar@minsa.gob.pe';
UPDATE gestion.sesion_usuario SET revocada_en = now()
 WHERE id = (SELECT s.id FROM gestion.sesion_usuario s JOIN gestion.usuario_interno u ON u.id = s.usuario_interno_id WHERE u.correo = 'g.eva@minsa.gob.pe' ORDER BY s.id LIMIT 1);
SELECT pg_sleep(0.05);

CREATE TEMP TABLE pg_temp.sesiones_previas AS
  SELECT s.id, s.revocada_en FROM gestion.sesion_usuario s JOIN gestion.usuario_interno u ON u.id = s.usuario_interno_id WHERE u.correo = 'g.eva@minsa.gob.pe';

UPDATE gestion.usuario_interno SET nombre_completo = 'Eva E. Establecimiento' WHERE correo = 'g.eva@minsa.gob.pe';
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM gestion.sesion_usuario s JOIN gestion.usuario_interno u ON u.id = s.usuario_interno_id
           WHERE u.correo = 'g.eva@minsa.gob.pe' AND s.revocada_en IS NULL) = 2, 'H01 cambiar otro dato del usuario no cierra sus sesiones';
END $$;

SELECT pg_temp.espera_error($q$UPDATE gestion.usuario_interno SET area_id = (SELECT id FROM catalogo.area WHERE codigo = 'OTRANS') WHERE correo = 'g.eva@minsa.gob.pe'$q$, '23514', 'H02 no se cambia el area a una de otro tipo que el rol');
SELECT pg_temp.espera_error($q$UPDATE gestion.usuario_interno SET area_id = (SELECT id FROM catalogo.area WHERE codigo = 'T13-DIRIS') WHERE correo = 'g.eva@minsa.gob.pe'$q$, '23514', 'H03 tampoco a una DIRIS');
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM gestion.sesion_usuario s JOIN gestion.usuario_interno u ON u.id = s.usuario_interno_id
           WHERE u.correo = 'g.eva@minsa.gob.pe' AND s.revocada_en IS NULL) = 2, 'H04 un cambio de area rechazado no cierra sesiones';
END $$;

SELECT set_config('app.actor', 'usuario:supervisor-13', false);
UPDATE gestion.usuario_interno SET area_id = (SELECT id FROM catalogo.area WHERE codigo = 'T13-EESS-B') WHERE correo = 'g.eva@minsa.gob.pe';
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM gestion.sesion_usuario s JOIN gestion.usuario_interno u ON u.id = s.usuario_interno_id
           WHERE u.correo = 'g.eva@minsa.gob.pe' AND s.revocada_en IS NULL) = 0, 'H05 cambiar el area cierra todas las sesiones abiertas del usuario';
  ASSERT (SELECT count(*) FROM gestion.sesion_usuario s JOIN pg_temp.sesiones_previas p ON p.id = s.id
           WHERE p.revocada_en IS NOT NULL AND s.revocada_en = p.revocada_en) = 1, 'H06 la sesion ya cerrada conserva su fecha original';
  ASSERT (SELECT count(*) FROM gestion.sesion_usuario s JOIN gestion.usuario_interno u ON u.id = s.usuario_interno_id
           WHERE u.correo = 'g.omar@minsa.gob.pe' AND s.revocada_en IS NULL) = 1, 'H07 las sesiones de otros usuarios no se tocan';
  ASSERT (SELECT count(*) FROM gestion.sesion_usuario s JOIN gestion.usuario_interno u ON u.id = s.usuario_interno_id
           WHERE u.correo = 'g.eva@minsa.gob.pe' AND s.usuario_modificacion = 'usuario:supervisor-13') = 2, 'H08 la base firma el cierre con el actor que cambio el area';
END $$;

INSERT INTO gestion.sesion_usuario (usuario_interno_id, vence_en)
SELECT u.id, now() + interval '8 hours' FROM gestion.usuario_interno u WHERE u.correo = 'g.eva@minsa.gob.pe';
SELECT pg_temp.espera_error($q$UPDATE gestion.usuario_interno SET area_id = NULL WHERE correo = 'g.eva@minsa.gob.pe'$q$, '23514', 'H09a quitarle el area a quien tiene un rol con tipo de area se rechaza');
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM gestion.sesion_usuario s JOIN gestion.usuario_interno u ON u.id = s.usuario_interno_id
           WHERE u.correo = 'g.eva@minsa.gob.pe' AND s.revocada_en IS NULL) = 1, 'H09b un cambio de area rechazado no cierra la sesion nueva';
END $$;

-- Quien solo es administrador (rol sin tipo de area) cambia de area o se queda sin ella, y se le cierran las sesiones
INSERT INTO gestion.sesion_usuario (usuario_interno_id, vence_en)
SELECT u.id, now() + interval '8 hours' FROM gestion.usuario_interno u WHERE u.correo = 'g.sinarea@minsa.gob.pe';
UPDATE gestion.usuario_interno SET area_id = (SELECT id FROM catalogo.area WHERE codigo = 'OTRANS') WHERE correo = 'g.sinarea@minsa.gob.pe';
DO $$
BEGIN
  ASSERT (SELECT a.codigo FROM gestion.usuario_interno u JOIN catalogo.area a ON a.id = u.area_id WHERE u.correo = 'g.sinarea@minsa.gob.pe') = 'OTRANS',
    'H10 el administrador puede estar en cualquier area';
  ASSERT (SELECT count(*) FROM gestion.sesion_usuario s JOIN gestion.usuario_interno u ON u.id = s.usuario_interno_id
           WHERE u.correo = 'g.sinarea@minsa.gob.pe' AND s.revocada_en IS NULL) = 0, 'H09 cambiar el area cierra las sesiones del administrador';
END $$;
UPDATE gestion.usuario_interno SET area_id = NULL WHERE correo = 'g.sinarea@minsa.gob.pe';
DO $$
BEGIN
  ASSERT (SELECT area_id IS NULL FROM gestion.usuario_interno WHERE correo = 'g.sinarea@minsa.gob.pe'), 'H11 el administrador puede quedarse sin area';
END $$;

-- Ana es administradora y gestora a la vez: su rol de gestor la ata a un establecimiento
SELECT pg_temp.espera_error($q$UPDATE gestion.usuario_interno SET area_id = (SELECT id FROM catalogo.area WHERE codigo = 'OTRANS') WHERE correo = 'g.ana@minsa.gob.pe'$q$, '23514', 'H12 un usuario con el rol gestor no se pasa a OTRANS');
UPDATE gestion.usuario_interno SET area_id = (SELECT id FROM catalogo.area WHERE codigo = 'T13-EESS-B') WHERE correo = 'g.ana@minsa.gob.pe';
DO $$
BEGIN
  ASSERT (SELECT a.codigo FROM gestion.usuario_interno u JOIN catalogo.area a ON a.id = u.area_id WHERE u.correo = 'g.ana@minsa.gob.pe') = 'T13-EESS-B',
    'H13 el gestor si cambia a otro establecimiento';
END $$;

\echo TODAS LAS PRUEBAS DE ROLES POR AREA PASARON
