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

SELECT set_config('app.actor', 'usuario:admin-prueba', false);

-- Credenciales: correo y huella Argon2id.
INSERT INTO gestion.usuario_interno (nombre_completo, correo, password_hash) VALUES
  ('Ana Prueba', 'ana@minsa.gob.pe', '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA'),
  ('Luis Prueba', 'luis@minsa.gob.pe', '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA');

DO $$
DECLARE u gestion.usuario_interno;
BEGIN
  SELECT * INTO u FROM gestion.usuario_interno WHERE correo = 'ana@minsa.gob.pe';
  ASSERT u.id IS NOT NULL AND u.activo, 'S01 el usuario nace activo con id generado por la base';
  ASSERT u.usuario_creacion = 'usuario:admin-prueba' AND u.version_fila = 1, 'S01 la base firma al usuario';
END $$;

SELECT pg_temp.espera_error($q$INSERT INTO gestion.usuario_interno (nombre_completo, correo, password_hash) VALUES ('X', 'x1@minsa.gob.pe', 'clave-en-claro')$q$, '23514', 'S02 la clave no se guarda en claro');
SELECT pg_temp.espera_error($q$INSERT INTO gestion.usuario_interno (nombre_completo, correo, password_hash) VALUES ('X', 'x2@minsa.gob.pe', '$2b$12$abcdefghijklmnopqrstuv')$q$, '23514', 'S03 solo se acepta la huella Argon2id');
SELECT pg_temp.espera_error($q$INSERT INTO gestion.usuario_interno (nombre_completo, correo, password_hash) VALUES ('X', 'Equis7@minsa.gob.pe', '$argon2id$v=19$m=1,t=1,p=1$a$b')$q$, '23514', 'S07 el correo va en minuscula');
SELECT pg_temp.espera_error($q$INSERT INTO gestion.usuario_interno (nombre_completo, correo, password_hash) VALUES ('X', 'ana@minsa.gob.pe', '$argon2id$v=19$m=1,t=1,p=1$a$b')$q$, '23505', 'S08 el correo es unico');
SELECT pg_temp.espera_error($q$INSERT INTO gestion.usuario_interno (nombre_completo, correo) VALUES ('X', 'x9@minsa.gob.pe')$q$, '23502', 'S09 la huella de la clave es obligatoria');

-- Sesion: nace abierta, firmada por la base.
INSERT INTO gestion.sesion_usuario (usuario_interno_id, vence_en)
SELECT id, now() + interval '8 hours' FROM gestion.usuario_interno WHERE correo = 'ana@minsa.gob.pe';

DO $$
DECLARE s gestion.sesion_usuario;
BEGIN
  SELECT * INTO s FROM gestion.sesion_usuario;
  ASSERT s.id IS NOT NULL AND s.revocada_en IS NULL AND s.ultima_actividad_en IS NOT NULL, 'S10 la sesion nace abierta con id de la base';
  ASSERT s.usuario_creacion = 'usuario:admin-prueba' AND s.version_fila = 1, 'S10 la base firma la sesion';
END $$;

SELECT pg_temp.espera_error($q$INSERT INTO gestion.sesion_usuario (usuario_interno_id, vence_en) SELECT id, now() - interval '1 minute' FROM gestion.usuario_interno WHERE correo = 'ana@minsa.gob.pe'$q$, '23514', 'S11 no se crea una sesion vencida');
SELECT pg_temp.espera_error($q$INSERT INTO gestion.sesion_usuario (usuario_interno_id, vence_en, revocada_en) SELECT id, now() + interval '1 hour', now() FROM gestion.usuario_interno WHERE correo = 'ana@minsa.gob.pe'$q$, '23514', 'S12 la sesion no nace revocada');
SELECT pg_temp.espera_error($q$UPDATE gestion.sesion_usuario SET usuario_interno_id = (SELECT id FROM gestion.usuario_interno WHERE correo = 'luis@minsa.gob.pe')$q$, '23514', 'S13 la sesion no cambia de dueno');
SELECT pg_temp.espera_error($q$UPDATE gestion.sesion_usuario SET vence_en = now() + interval '30 days'$q$, '23514', 'S14 el vencimiento absoluto no se extiende');
SELECT pg_temp.espera_error($q$UPDATE gestion.sesion_usuario SET ultima_actividad_en = now() - interval '1 day'$q$, '23514', 'S15 la actividad no retrocede');
SELECT pg_temp.espera_error($q$DELETE FROM gestion.sesion_usuario$q$, '23001', 'S16 la sesion no se borra');

SELECT set_config('app.actor', 'usuario:ana', false);
UPDATE gestion.sesion_usuario SET ultima_actividad_en = now() + interval '1 minute';
DO $$
DECLARE s gestion.sesion_usuario;
BEGIN
  SELECT * INTO s FROM gestion.sesion_usuario;
  ASSERT s.version_fila = 2 AND s.usuario_modificacion = 'usuario:ana' AND s.usuario_creacion = 'usuario:admin-prueba',
    'S17 renovar la actividad sube la version y firma quien lo hizo';
END $$;

-- Revocar: la fecha la pone la base, una sola vez, y una sesion revocada no se toca.
UPDATE gestion.sesion_usuario SET revocada_en = now() - interval '1 year';
DO $$
BEGIN
  ASSERT (SELECT revocada_en FROM gestion.sesion_usuario) > now() - interval '1 minute', 'S18 la fecha de revocacion la fija la base';
END $$;
SELECT pg_temp.espera_error($q$UPDATE gestion.sesion_usuario SET revocada_en = NULL$q$, '23514', 'S19 una sesion revocada no se reabre');
SELECT pg_temp.espera_error($q$UPDATE gestion.sesion_usuario SET ultima_actividad_en = now() + interval '2 minutes'$q$, '23514', 'S20 una sesion revocada no se modifica');

-- Desactivar a un usuario cierra todas sus sesiones abiertas y no toca las ya cerradas.
SELECT set_config('app.actor', 'usuario:admin-prueba', false);
INSERT INTO gestion.sesion_usuario (usuario_interno_id, vence_en)
SELECT id, now() + interval '8 hours' FROM gestion.usuario_interno WHERE correo = 'luis@minsa.gob.pe';
INSERT INTO gestion.sesion_usuario (usuario_interno_id, vence_en)
SELECT id, now() + interval '8 hours' FROM gestion.usuario_interno WHERE correo = 'luis@minsa.gob.pe';
UPDATE gestion.sesion_usuario SET revocada_en = now()
 WHERE id = (SELECT id FROM gestion.sesion_usuario WHERE usuario_interno_id = (SELECT id FROM gestion.usuario_interno WHERE correo = 'luis@minsa.gob.pe') ORDER BY id LIMIT 1);
SELECT pg_sleep(0.05);

CREATE TEMP TABLE pg_temp.cierre_previo AS
  SELECT id, revocada_en FROM gestion.sesion_usuario
   WHERE usuario_interno_id = (SELECT id FROM gestion.usuario_interno WHERE correo = 'luis@minsa.gob.pe');

UPDATE gestion.usuario_interno SET activo = false, eliminado_en = now(), eliminado_por = 'usuario:admin-prueba' WHERE correo = 'luis@minsa.gob.pe';

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM gestion.sesion_usuario WHERE usuario_interno_id = (SELECT id FROM gestion.usuario_interno WHERE correo = 'luis@minsa.gob.pe')
             AND revocada_en IS NULL) = 0, 'S21 desactivar al usuario cierra todas sus sesiones';
  ASSERT (SELECT count(*) FROM gestion.sesion_usuario s JOIN pg_temp.cierre_previo p ON p.id = s.id
           WHERE p.revocada_en IS NOT NULL AND s.revocada_en = p.revocada_en) = 1, 'S22 la sesion ya cerrada conserva su fecha original';
  ASSERT (SELECT count(*) FROM gestion.sesion_usuario WHERE usuario_interno_id = (SELECT id FROM gestion.usuario_interno WHERE correo = 'luis@minsa.gob.pe')
             AND usuario_modificacion = 'usuario:admin-prueba') = 2, 'S23 la base firma el cierre con el actor que desactivo';
  ASSERT (SELECT revocada_en IS NULL FROM gestion.sesion_usuario WHERE usuario_interno_id = (SELECT id FROM gestion.usuario_interno WHERE correo = 'ana@minsa.gob.pe') LIMIT 1) = false,
    'S24 las sesiones de otros usuarios no se tocan (la de ana sigue como estaba)';
END $$;

SELECT pg_temp.espera_error($q$INSERT INTO gestion.sesion_usuario (usuario_interno_id, vence_en) SELECT id, now() + interval '1 hour' FROM gestion.usuario_interno WHERE correo = 'luis@minsa.gob.pe'$q$, '23514', 'S25 no se abre sesion a un usuario desactivado');

UPDATE gestion.usuario_interno SET activo = true, eliminado_en = NULL, eliminado_por = NULL WHERE correo = 'luis@minsa.gob.pe';
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM gestion.sesion_usuario WHERE usuario_interno_id = (SELECT id FROM gestion.usuario_interno WHERE correo = 'luis@minsa.gob.pe')
             AND revocada_en IS NULL) = 0, 'S26 reactivar al usuario no reabre sesiones: hay que iniciar una nueva';
END $$;

\echo TODAS LAS PRUEBAS DE CREDENCIALES Y SESIONES PASARON
