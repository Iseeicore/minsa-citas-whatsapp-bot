\set ON_ERROR_STOP on
\set QUIET on

CREATE OR REPLACE FUNCTION pg_temp.espera_error(p_sql text, p_estado text, p_patron text, p_nombre text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = p_estado AND SQLERRM LIKE p_patron THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'PRUEBA % FALLO: se esperaba % con mensaje % pero llego % (%)', p_nombre, p_estado, p_patron, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'PRUEBA % FALLO: la operacion debia fallar con %', p_nombre, p_estado;
END;
$$;

CREATE FUNCTION pg_temp.huella() RETURNS text
LANGUAGE sql AS $$
  SELECT '$argon2id$v=19$m=65536,p=4,t=3$T0Iq4v7ItxALsCE7IRbeGw$1kuEOxDEcfcB1dyfkO/+WUysMPrJfHWrjvvO51jPW8g'::text
$$;

DO $$
BEGIN
  ASSERT to_regprocedure('gestion.crear_administrador(text, text, text)') IS NOT NULL, 'C01 existe la funcion con correo, huella y nombre';
  ASSERT obj_description('gestion.crear_administrador(text, text, text)'::regprocedure, 'pg_proc') LIKE '%No se ejecuta sola%',
    'C01 la funcion tiene descripcion y dice que no se ejecuta sola';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'crear_administrador_prueba'), 'C02 no queda una funcion con un usuario fijo';
  ASSERT NOT EXISTS (SELECT 1 FROM gestion.usuario_interno WHERE usuario_creacion = 'sistema:migracion'), 'C02 la migracion no creo usuarios';
END $$;

TRUNCATE gestion.usuario_interno CASCADE;
TRUNCATE chatbot.incidencia_etiqueta, chatbot.archivo_recibido, chatbot.solicitud_carga, chatbot.evidencia, chatbot.incidencia_paciente_auditoria,
         ia.entrenamiento_categoria, chatbot.incidencia_analisis, chatbot.incidencia_paciente, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion;
DELETE FROM catalogo.establecimiento_salud;
DELETE FROM catalogo.area WHERE codigo <> 'OTRANS' AND padre_id IS NOT NULL;
DELETE FROM catalogo.area WHERE codigo <> 'OTRANS';

SELECT pg_temp.espera_error(format('SELECT gestion.crear_administrador(%L, %L)', 'ana@minsa.gob.pe', pg_temp.huella()),
  '42704', '%6206%cargar_hospitales_fase_1%', 'C03 sin hospitales se niega y pide cargarlos antes');

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM gestion.usuario_interno) = 0, 'C03 al negarse no crea ningun usuario';
  PERFORM catalogo.cargar_hospitales_fase_1();
  DELETE FROM catalogo.establecimiento_salud WHERE codigo_renipress = '33381';
END $$;

SELECT pg_temp.espera_error(format('SELECT gestion.crear_administrador(%L, %L)', 'ana@minsa.gob.pe', pg_temp.huella()),
  '42704', '%faltan los hospitales 33381;%', 'C04 con un hospital faltante se niega y nombra solo ese');

DO $$
BEGIN
  ASSERT catalogo.cargar_hospitales_fase_1() = 1, 'C04 la carga repone el hospital faltante';
END $$;

SELECT pg_temp.espera_error($q$SELECT gestion.crear_administrador('ana@minsa.gob.pe', 'ClaveEnTextoPlano123')$q$,
  '22023', '%Argon2id%', 'C05 una clave en texto plano se rechaza');
DO $$
BEGIN
  BEGIN
    PERFORM gestion.crear_administrador('ana@minsa.gob.pe', 'ClaveEnTextoPlano123');
  EXCEPTION WHEN invalid_parameter_value THEN
    ASSERT position('ClaveEnTextoPlano123' IN SQLERRM) = 0, 'C05 el mensaje no repite la clave recibida';
  END;
END $$;

SELECT pg_temp.espera_error(format('SELECT gestion.crear_administrador(%L, NULL)', 'ana@minsa.gob.pe'),
  '22023', '%Argon2id%', 'C05 sin huella se rechaza');
SELECT pg_temp.espera_error(format('SELECT gestion.crear_administrador(NULL, %L)', pg_temp.huella()),
  '22023', '%correo%', 'C06 sin correo se rechaza');
SELECT pg_temp.espera_error(format('SELECT gestion.crear_administrador(%L, %L)', 'no-es-un-correo', pg_temp.huella()),
  '22023', '%correo%', 'C06 un correo sin formato se rechaza');
SELECT pg_temp.espera_error(format('SELECT gestion.crear_administrador(%L, %L, %L)', 'ana@minsa.gob.pe', pg_temp.huella(), '   '),
  '22023', '%nombre%', 'C06 un nombre en blanco se rechaza');

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM gestion.usuario_interno) = 0, 'C06 ningun rechazo creo usuarios';
END $$;

SELECT set_config('app.actor', 'persona:dba', false);

DO $$
BEGIN
  ASSERT gestion.crear_administrador('  Ana.Admin@MINSA.gob.pe ', pg_temp.huella()) = 1, 'C07 con solo correo y huella crea el administrador y devuelve 1';
  ASSERT EXISTS (
    SELECT 1 FROM gestion.usuario_interno
     WHERE correo = 'ana.admin@minsa.gob.pe' AND nombre_completo = 'Administrador' AND activo AND eliminado_en IS NULL
       AND area_id IS NULL AND password_hash = pg_temp.huella() AND usuario_creacion = 'sistema:crear-administrador'
  ), 'C07 guarda el correo como lo busca el login, el nombre Administrador por defecto, la huella y sin area';
  ASSERT (SELECT string_agg(r.codigo, ',')
            FROM gestion.usuario_rol ur
            JOIN gestion.rol r ON r.id = ur.rol_id
            JOIN gestion.usuario_interno u ON u.id = ur.usuario_interno_id
           WHERE u.correo = 'ana.admin@minsa.gob.pe') = 'ADMINISTRADOR', 'C07 tiene solo el rol ADMINISTRADOR';
  ASSERT current_setting('app.actor') = 'persona:dba', 'C07 devuelve el actor que tenia la sesion';

  ASSERT gestion.crear_administrador('otro@minsa.gob.pe', pg_temp.huella(), '  Otro Admin  ') = 1, 'C08 acepta un nombre opcional';
  ASSERT (SELECT nombre_completo FROM gestion.usuario_interno WHERE correo = 'otro@minsa.gob.pe') = 'Otro Admin', 'C08 guarda el nombre sin espacios';
END $$;

UPDATE gestion.usuario_interno SET nombre_completo = 'Nombre cambiado' WHERE correo = 'ana.admin@minsa.gob.pe';

DO $$
BEGIN
  ASSERT gestion.crear_administrador('ANA.ADMIN@minsa.gob.pe', pg_temp.huella()) = 0, 'C09 repetir el correo no crea nada y devuelve 0';
  ASSERT (SELECT count(*) FROM gestion.usuario_interno) = 2, 'C09 no duplica usuarios';
  ASSERT (SELECT nombre_completo FROM gestion.usuario_interno WHERE correo = 'ana.admin@minsa.gob.pe') = 'Nombre cambiado', 'C09 si ya existe no lo toca';
  ASSERT (SELECT count(*) FROM gestion.usuario_rol) = 2, 'C09 no agrega roles';
END $$;

SELECT set_config('app.actor', '', false);
TRUNCATE gestion.usuario_interno CASCADE;
DELETE FROM catalogo.establecimiento_salud;
DELETE FROM catalogo.area WHERE codigo <> 'OTRANS' AND padre_id IS NOT NULL;
DELETE FROM catalogo.area WHERE codigo <> 'OTRANS';

\echo TODAS LAS PRUEBAS DE CREAR ADMINISTRADOR PASARON
