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

-- Mensaje estable del tope: lo mapea el backend
CREATE OR REPLACE FUNCTION pg_temp.espera_tope(p_sql text, p_nombre text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '23514' AND SQLERRM = 'usuario_interno: el establecimiento ya tiene 3 usuarios activos' THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'PRUEBA % FALLO: se esperaba el tope de 3 usuarios pero llego % (%)', p_nombre, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'PRUEBA % FALLO: la operacion debia fallar por el tope de 3 usuarios', p_nombre;
END;
$$;

SELECT set_config('app.actor', 'usuario:admin-18', false);

INSERT INTO catalogo.area (codigo, nombre, tipo_area_id) VALUES
  ('T18-EESS-A', 'Establecimiento 18-A', 1),
  ('T18-EESS-B', 'Establecimiento 18-B', 1),
  ('T18-OTRANS', 'Segunda oficina de transparencia', 2),
  ('T18-DIRIS', 'DIRIS 18', 3);

CREATE FUNCTION pg_temp.usuario(p_correo text, p_area text) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO gestion.usuario_interno (nombre_completo, correo, password_hash, area_id)
  SELECT p_correo, p_correo, '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA', (SELECT id FROM catalogo.area WHERE codigo = p_area);
$$;

-- ===== Hasta 3 activos por establecimiento, de cualquier rol =====
SELECT pg_temp.usuario('t18.a1@minsa.gob.pe', 'T18-EESS-A');
SELECT pg_temp.usuario('t18.a2@minsa.gob.pe', 'T18-EESS-A');
SELECT pg_temp.usuario('t18.a3@minsa.gob.pe', 'T18-EESS-A');
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM gestion.usuario_interno WHERE correo LIKE 't18.a_@minsa.gob.pe' AND activo) = 3, 'U01 un establecimiento admite 3 usuarios activos';
END $$;

SELECT pg_temp.espera_tope($q$SELECT pg_temp.usuario('t18.a4@minsa.gob.pe', 'T18-EESS-A')$q$, 'U02 el cuarto usuario activo del establecimiento se rechaza al insertar');

-- El tope es por establecimiento
SELECT pg_temp.usuario('t18.b1@minsa.gob.pe', 'T18-EESS-B');
SELECT pg_temp.usuario('t18.b2@minsa.gob.pe', 'T18-EESS-B');
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM gestion.usuario_interno WHERE correo LIKE 't18.b_@minsa.gob.pe') = 2, 'U03 otro establecimiento tiene su propio tope';
END $$;

-- Cambiar de area a un establecimiento lleno
SELECT pg_temp.espera_tope($q$UPDATE gestion.usuario_interno SET area_id = (SELECT id FROM catalogo.area WHERE codigo = 'T18-EESS-A') WHERE correo = 't18.b1@minsa.gob.pe'$q$, 'U04 pasar un usuario activo a un establecimiento lleno se rechaza');
DO $$
BEGIN
  ASSERT (SELECT a.codigo FROM gestion.usuario_interno u JOIN catalogo.area a ON a.id = u.area_id WHERE u.correo = 't18.b1@minsa.gob.pe') = 'T18-EESS-B', 'U04 el rechazo no mueve al usuario';
END $$;

-- Desactivar libera un cupo; un inactivo no cuenta
UPDATE gestion.usuario_interno SET activo = false, eliminado_en = now(), eliminado_por = 'usuario:admin-18' WHERE correo = 't18.a3@minsa.gob.pe';
SELECT pg_temp.usuario('t18.a4@minsa.gob.pe', 'T18-EESS-A');
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM gestion.usuario_interno WHERE correo LIKE 't18.a_@minsa.gob.pe' AND activo) = 3, 'U05 desactivar a uno libera su cupo';
  ASSERT (SELECT count(*) FROM gestion.usuario_interno WHERE correo LIKE 't18.a_@minsa.gob.pe') = 4, 'U05 el desactivado sigue existiendo (nunca se borra)';
END $$;

-- Reactivar con el establecimiento lleno
SELECT pg_temp.espera_tope($q$UPDATE gestion.usuario_interno SET activo = true, eliminado_en = NULL, eliminado_por = NULL WHERE correo = 't18.a3@minsa.gob.pe'$q$, 'U06 reactivar a un usuario con el establecimiento lleno se rechaza');
DO $$
BEGIN
  ASSERT (SELECT NOT activo FROM gestion.usuario_interno WHERE correo = 't18.a3@minsa.gob.pe'), 'U06 el rechazo lo deja desactivado';
END $$;

-- Un usuario desactivado puede cambiar de area aunque el destino este lleno (no suma)
UPDATE gestion.usuario_interno SET area_id = (SELECT id FROM catalogo.area WHERE codigo = 'T18-EESS-B') WHERE correo = 't18.a3@minsa.gob.pe';
UPDATE gestion.usuario_interno SET area_id = (SELECT id FROM catalogo.area WHERE codigo = 'T18-EESS-A') WHERE correo = 't18.a3@minsa.gob.pe';
DO $$
BEGIN
  ASSERT (SELECT NOT activo FROM gestion.usuario_interno WHERE correo = 't18.a3@minsa.gob.pe'), 'U07 un desactivado no cuenta para el tope';
END $$;

-- Reactivar con cupo libre
UPDATE gestion.usuario_interno SET activo = false, eliminado_en = now(), eliminado_por = 'usuario:admin-18' WHERE correo = 't18.a4@minsa.gob.pe';
UPDATE gestion.usuario_interno SET activo = true, eliminado_en = NULL, eliminado_por = NULL WHERE correo = 't18.a3@minsa.gob.pe';
DO $$
BEGIN
  ASSERT (SELECT activo FROM gestion.usuario_interno WHERE correo = 't18.a3@minsa.gob.pe'), 'U08 con cupo libre se puede reactivar';
END $$;

-- Cambiar de area a un establecimiento con cupo
UPDATE gestion.usuario_interno SET area_id = (SELECT id FROM catalogo.area WHERE codigo = 'T18-EESS-B') WHERE correo = 't18.a1@minsa.gob.pe';
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM gestion.usuario_interno u JOIN catalogo.area a ON a.id = u.area_id WHERE a.codigo = 'T18-EESS-B' AND u.activo) = 3, 'U09 con cupo libre se puede cambiar de area';
END $$;

-- Una modificacion que no toca el area ni la vigencia no se revisa (aunque el establecimiento este lleno)
UPDATE gestion.usuario_interno SET nombre_completo = 'Nombre cambiado' WHERE correo = 't18.b1@minsa.gob.pe';
UPDATE gestion.usuario_interno SET area_id = area_id, activo = activo WHERE correo = 't18.b1@minsa.gob.pe';
DO $$
BEGIN
  ASSERT (SELECT nombre_completo FROM gestion.usuario_interno WHERE correo = 't18.b1@minsa.gob.pe') = 'Nombre cambiado', 'U10 editar otros datos de un usuario en un establecimiento lleno es posible';
END $$;

-- Los usuarios sin area o en areas que no son de un establecimiento no tienen tope
SELECT pg_temp.usuario('t18.o1@minsa.gob.pe', 'OTRANS');
SELECT pg_temp.usuario('t18.o2@minsa.gob.pe', 'OTRANS');
SELECT pg_temp.usuario('t18.o3@minsa.gob.pe', 'OTRANS');
SELECT pg_temp.usuario('t18.o4@minsa.gob.pe', 'OTRANS');
SELECT pg_temp.usuario('t18.o5@minsa.gob.pe', 'T18-OTRANS');
SELECT pg_temp.usuario('t18.o6@minsa.gob.pe', 'T18-OTRANS');
SELECT pg_temp.usuario('t18.o7@minsa.gob.pe', 'T18-OTRANS');
SELECT pg_temp.usuario('t18.o8@minsa.gob.pe', 'T18-OTRANS');
SELECT pg_temp.usuario('t18.d1@minsa.gob.pe', 'T18-DIRIS');
SELECT pg_temp.usuario('t18.d2@minsa.gob.pe', 'T18-DIRIS');
SELECT pg_temp.usuario('t18.d3@minsa.gob.pe', 'T18-DIRIS');
SELECT pg_temp.usuario('t18.d4@minsa.gob.pe', 'T18-DIRIS');
SELECT pg_temp.usuario('t18.s1@minsa.gob.pe', NULL);
SELECT pg_temp.usuario('t18.s2@minsa.gob.pe', NULL);
SELECT pg_temp.usuario('t18.s3@minsa.gob.pe', NULL);
SELECT pg_temp.usuario('t18.s4@minsa.gob.pe', NULL);
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM gestion.usuario_interno WHERE correo LIKE 't18.o_@minsa.gob.pe' AND activo) = 8, 'U11 OTRANS (y cualquier area que no es de un establecimiento) no tiene tope';
  ASSERT (SELECT count(*) FROM gestion.usuario_interno WHERE correo LIKE 't18.d_@minsa.gob.pe' OR correo LIKE 't18.s_@minsa.gob.pe') = 8, 'U12 las DIRIS y los usuarios sin area tampoco';
END $$;

-- Tampoco al pasar a un area sin tope
UPDATE gestion.usuario_interno SET area_id = (SELECT id FROM catalogo.area WHERE codigo = 'OTRANS') WHERE correo = 't18.b2@minsa.gob.pe';
DO $$
BEGIN
  ASSERT (SELECT a.codigo FROM gestion.usuario_interno u JOIN catalogo.area a ON a.id = u.area_id WHERE u.correo = 't18.b2@minsa.gob.pe') = 'OTRANS', 'U13 se pasa sin tope a OTRANS';
END $$;

-- Con roles: el tope cuenta usuarios de cualquier rol
SELECT pg_temp.usuario('t18.r1@minsa.gob.pe', 'T18-EESS-B');
INSERT INTO gestion.usuario_rol (usuario_interno_id, rol_id)
SELECT u.id, r.id FROM gestion.usuario_interno u, gestion.rol r WHERE u.correo = 't18.r1@minsa.gob.pe' AND r.codigo = 'GESTOR';
SELECT pg_temp.espera_tope($q$SELECT pg_temp.usuario('t18.r2@minsa.gob.pe', 'T18-EESS-B')$q$, 'U14 un establecimiento con 3 activos (uno gestor) rechaza al cuarto, sea cual sea su rol');

-- La base tambien lo hace cumplir con varias sesiones a la vez
CREATE EXTENSION IF NOT EXISTS dblink;
INSERT INTO catalogo.area (codigo, nombre, tipo_area_id) VALUES ('T18-EESS-C', 'Establecimiento 18-C', 1);
SELECT pg_temp.usuario('t18.c1@minsa.gob.pe', 'T18-EESS-C');
SELECT pg_temp.usuario('t18.c2@minsa.gob.pe', 'T18-EESS-C');
SELECT dblink_connect('c_a', format('dbname=%s user=%s', current_database(), current_user));
SELECT dblink_connect('c_b', format('dbname=%s user=%s', current_database(), current_user));
SELECT dblink_exec('c_a', 'BEGIN');
SELECT dblink_exec('c_a', format($f$INSERT INTO gestion.usuario_interno (nombre_completo, correo, password_hash, area_id) VALUES ('cc1', 't18.cc1@minsa.gob.pe', '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA', %s)$f$,
  (SELECT id FROM catalogo.area WHERE codigo = 'T18-EESS-C')));
SELECT dblink_send_query('c_b', format($f$INSERT INTO gestion.usuario_interno (nombre_completo, correo, password_hash, area_id) VALUES ('cc2', 't18.cc2@minsa.gob.pe', '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA', %s)$f$,
  (SELECT id FROM catalogo.area WHERE codigo = 'T18-EESS-C')));
SELECT pg_sleep(0.5);
DO $$
BEGIN
  ASSERT dblink_is_busy('c_b') = 1, 'U15 la segunda alta del mismo establecimiento espera mientras la primera no termina';
END $$;
SELECT dblink_exec('c_a', 'COMMIT');
DO $$
DECLARE
  v_rechazada boolean := false;
BEGIN
  BEGIN
    PERFORM * FROM dblink_get_result('c_b') AS t(r text);
  EXCEPTION WHEN OTHERS THEN
    v_rechazada := SQLERRM LIKE '%el establecimiento ya tiene 3 usuarios activos%';
  END;
  ASSERT v_rechazada, 'U16 con un solo cupo libre, la segunda alta simultanea se rechaza por el tope';
  ASSERT (SELECT count(*) FROM gestion.usuario_interno u JOIN catalogo.area a ON a.id = u.area_id WHERE a.codigo = 'T18-EESS-C' AND u.activo) = 3, 'U16 el establecimiento queda con 3 activos';
END $$;
SELECT dblink_disconnect('c_a');
SELECT dblink_disconnect('c_b');

-- La segunda area OTRANS era solo de esta prueba: se desactiva para que las siguientes vean una unica area que recibe sensibles
UPDATE catalogo.area SET activo = false WHERE codigo = 'T18-OTRANS';

\echo TODAS LAS PRUEBAS DE USUARIOS POR ESTABLECIMIENTO PASARON
