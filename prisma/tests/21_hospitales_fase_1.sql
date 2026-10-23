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
  SELECT coalesce((SELECT string_agg(codigo_renipress || ':' || version_fila || ':' || fecha_modificacion::text, ',' ORDER BY codigo_renipress) FROM catalogo.establecimiento_salud), '')
      || '|' || coalesce((SELECT string_agg(codigo || ':' || version_fila || ':' || fecha_modificacion::text, ',' ORDER BY codigo) FROM catalogo.area), '')
$$;

CREATE FUNCTION pg_temp.contenido() RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(
           e.codigo_renipress || '|' || e.nombre || '|' || n.codigo || '|' || coalesce(e.categoria, '-') || '|' || coalesce(e.departamento, '-')
           || '|' || coalesce(e.provincia, '-') || '|' || coalesce(e.distrito, '-') || '|' || a.codigo || '|' || ta.codigo || '|' || p.codigo || '|' || p.nombre,
           ';' ORDER BY e.codigo_renipress), '')
    FROM catalogo.establecimiento_salud e
    JOIN catalogo.nivel_atencion n ON n.id = e.nivel_atencion_id
    JOIN catalogo.area a ON a.id = e.area_id
    JOIN catalogo.tipo_area ta ON ta.id = a.tipo_area_id
    JOIN catalogo.area p ON p.id = a.padre_id
   WHERE e.codigo_renipress IN ('6206', '5946', '6215', '33381')
$$;

DO $$
BEGIN
  ASSERT to_regprocedure('catalogo.cargar_hospitales_fase_1()') IS NOT NULL, 'H01 existe la funcion de carga';
  ASSERT to_regprocedure('catalogo.retirar_hospitales_fase_1()') IS NOT NULL, 'H01 existe la funcion de retiro';
  ASSERT obj_description('catalogo.cargar_hospitales_fase_1()'::regprocedure, 'pg_proc') LIKE '%No se ejecuta sola%'
     AND obj_description('catalogo.retirar_hospitales_fase_1()'::regprocedure, 'pg_proc') LIKE '%No se ejecuta sola%',
    'H02 las dos funciones tienen descripcion y dicen que no se ejecutan solas';
  ASSERT NOT EXISTS (SELECT 1 FROM catalogo.establecimiento_salud WHERE usuario_creacion = 'sistema:semilla'), 'H03 la semilla no inserto establecimientos';
  ASSERT NOT EXISTS (SELECT 1 FROM catalogo.area WHERE usuario_creacion = 'sistema:semilla' AND codigo <> 'OTRANS'), 'H03 ni areas fuera de OTRANS';
END $$;

TRUNCATE gestion.usuario_interno CASCADE;
TRUNCATE chatbot.incidencia_etiqueta, chatbot.archivo_recibido, chatbot.solicitud_carga, chatbot.evidencia, chatbot.incidencia_paciente_auditoria,
         ia.entrenamiento_categoria, chatbot.incidencia_analisis, chatbot.incidencia_paciente, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion;
DELETE FROM catalogo.establecimiento_salud;
DELETE FROM catalogo.area WHERE codigo <> 'OTRANS' AND padre_id IS NOT NULL;
DELETE FROM catalogo.area WHERE codigo <> 'OTRANS';

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM catalogo.establecimiento_salud) = 0 AND (SELECT count(*) FROM catalogo.area) = 1, 'H04 la base de partida no tiene hospitales ni DIRIS';
  ASSERT catalogo.retirar_hospitales_fase_1() = 0, 'H05 retirar sin hospitales cargados no hace nada y devuelve 0';
END $$;

SELECT set_config('app.actor', 'usuario:dba-21', false);
DO $$
DECLARE v integer;
BEGIN
  v := catalogo.cargar_hospitales_fase_1();
  ASSERT v = 4, 'H06 la carga devuelve 4 hospitales creados';
  ASSERT current_setting('app.actor') = 'usuario:dba-21', 'H07 la carga deja el actor como estaba';
END $$;

DO $$
BEGIN
  ASSERT pg_temp.contenido() =
    '33381|Hospital de Lima Este - Vitarte (III-E)|III|III-E|-|-|-|EESS-33381|ESTABLECIMIENTO|DIRIS-LE|DIRIS Lima Este;'
    || '5946|Hospital Nacional Hipólito Unanue|III|-|-|-|-|EESS-5946|ESTABLECIMIENTO|DIRIS-LE|DIRIS Lima Este;'
    || '6206|HOSPITAL NACIONAL DOS DE MAYO|III|-|-|-|-|EESS-6206|ESTABLECIMIENTO|DIRIS-LC|DIRIS Lima Centro;'
    || '6215|HOSPITAL NACIONAL DOCENTE MADRE NIÑO SAN BARTOLOME|III|-|-|-|-|EESS-6215|ESTABLECIMIENTO|DIRIS-LC|DIRIS Lima Centro',
    'H08 los cuatro hospitales quedan con sus datos, su area EESS y su DIRIS';
  ASSERT (SELECT string_agg(a.codigo || '=' || a.nombre, ',' ORDER BY a.codigo) FROM catalogo.area a JOIN catalogo.tipo_area ta ON ta.id = a.tipo_area_id WHERE ta.codigo = 'DIRIS')
         = 'DIRIS-LC=DIRIS Lima Centro,DIRIS-LE=DIRIS Lima Este', 'H09 solo se crean las dos DIRIS que usan los hospitales';
  ASSERT (SELECT count(*) FROM catalogo.area) = 7 AND (SELECT count(*) FROM catalogo.establecimiento_salud) = 4, 'H10 7 areas (OTRANS, 2 DIRIS, 4 hospitales) y 4 establecimientos';
  ASSERT (SELECT bool_and(usuario_creacion = 'sistema:carga-hospitales-fase-1' AND version_fila = 1 AND activo) FROM catalogo.establecimiento_salud), 'H11 los establecimientos nacen activos y firmados por la carga';
  ASSERT (SELECT bool_and(usuario_creacion = 'sistema:carga-hospitales-fase-1' AND version_fila = 1) FROM catalogo.area WHERE codigo <> 'OTRANS'), 'H11 y las areas';
  ASSERT (SELECT count(*) FROM catalogo.area a JOIN catalogo.establecimiento_salud e ON e.area_id = a.id WHERE a.codigo = 'EESS-' || e.codigo_renipress AND a.nombre = e.nombre) = 4, 'H12 cada area EESS tiene el nombre y el codigo de su hospital';
END $$;

CREATE TEMP TABLE huella_1 AS SELECT pg_temp.huella() AS h;
SELECT pg_sleep(0.05);
DO $$
BEGIN
  ASSERT catalogo.cargar_hospitales_fase_1() = 0, 'H13 cargar otra vez devuelve 0';
  ASSERT pg_temp.huella() = (SELECT h FROM huella_1), 'H13 cargar dos veces no cambia versiones ni fechas';
  ASSERT (SELECT count(*) FROM catalogo.area) = 7 AND (SELECT count(*) FROM catalogo.establecimiento_salud) = 4, 'H14 no se duplica nada';
  ASSERT catalogo.cargar_hospitales_fase_1() = 0 AND catalogo.cargar_hospitales_fase_1() = 0, 'H15 varias llamadas en la misma transaccion tambien funcionan';
END $$;

UPDATE catalogo.establecimiento_salud SET nombre = 'NOMBRE CAMBIADO A MANO' WHERE codigo_renipress = '6206';
UPDATE catalogo.area SET nombre = 'AREA RENOMBRADA' WHERE codigo = 'EESS-5946';
DO $$
BEGIN
  ASSERT catalogo.cargar_hospitales_fase_1() = 2, 'H16 corrige lo que se cambio a mano: dos hospitales';
  ASSERT (SELECT nombre || '/' || version_fila FROM catalogo.establecimiento_salud WHERE codigo_renipress = '6206') = 'HOSPITAL NACIONAL DOS DE MAYO/3', 'H16 el establecimiento vuelve a su nombre';
  ASSERT (SELECT nombre FROM catalogo.area WHERE codigo = 'EESS-5946') = 'Hospital Nacional Hipólito Unanue', 'H16 el area vuelve a su nombre';
  ASSERT (SELECT bool_and(version_fila = 1) FROM catalogo.establecimiento_salud WHERE codigo_renipress IN ('5946', '6215', '33381')), 'H17 lo que no cambio no se toca';
  ASSERT catalogo.cargar_hospitales_fase_1() = 0, 'H17 y la siguiente vuelve a no hacer nada';
END $$;

CREATE TEMP TABLE contenido_1 AS SELECT pg_temp.contenido() AS c;

INSERT INTO catalogo.area (codigo, nombre, tipo_area_id, padre_id)
SELECT 'T21-ORIGEN', 'Origen de prueba 21', ta.id, (SELECT id FROM catalogo.area WHERE codigo = 'DIRIS-LC')
  FROM catalogo.tipo_area ta WHERE ta.codigo = 'ESTABLECIMIENTO';
INSERT INTO catalogo.establecimiento_salud (codigo_renipress, nombre, nivel_atencion_id, area_id)
SELECT '9210', 'Origen de prueba 21', 1, id FROM catalogo.area WHERE codigo = 'T21-ORIGEN';

CREATE FUNCTION pg_temp.nuevo(p_traza text, p_eess text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_usuario uuid;
BEGIN
  PERFORM set_config('app.actor', 'ciudadano:' || p_traza, false);
  INSERT INTO chatbot.usuario (wa_id) VALUES ('wa-' || p_traza) RETURNING id INTO v_usuario;
  INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, descripcion, trace_id, establecimiento_id)
  VALUES (1, v_usuario, 'wa-' || p_traza, true, 'Caso ' || p_traza, p_traza,
          (SELECT id FROM catalogo.establecimiento_salud WHERE codigo_renipress = p_eess));
END;
$$;

CREATE FUNCTION pg_temp.usuario(p_correo text, p_area text) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO gestion.usuario_interno (nombre_completo, correo, password_hash, area_id)
  SELECT p_correo, p_correo, '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA', (SELECT id FROM catalogo.area WHERE codigo = p_area);
$$;

SELECT pg_temp.nuevo('t21-origen', '6206');
SELECT set_config('app.actor', 'usuario:dba-21', false);
SELECT pg_temp.espera_error($q$SELECT catalogo.retirar_hospitales_fase_1()$q$, '23001', '%6206 (incidencias: 1, derivaciones: 0, usuarios: 0)%',
  'H18 un hospital con una incidencia de origen no se retira y el mensaje lo nombra');
DO $$
BEGIN
  ASSERT pg_temp.contenido() = (SELECT c FROM contenido_1), 'H19 la negativa no borra ningun hospital, ni siquiera los que no tienen datos';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente) = 1, 'H19 y no toca la incidencia';
END $$;

SELECT pg_temp.usuario('t21.5946@minsa.gob.pe', 'EESS-5946');
SELECT pg_temp.espera_error($q$SELECT catalogo.retirar_hospitales_fase_1()$q$, '23001', '%5946 (incidencias: 0, derivaciones: 0, usuarios: 1)%',
  'H20 un hospital con un usuario no se retira y el mensaje cuenta los usuarios');
SELECT pg_temp.espera_error($q$SELECT catalogo.retirar_hospitales_fase_1()$q$, '23001', '%5946 (incidencias: 0%; 6206 (%',
  'H20 el mensaje nombra todos los hospitales con datos, en orden de codigo');
DO $$
BEGIN
  ASSERT pg_temp.contenido() = (SELECT c FROM contenido_1) AND (SELECT count(*) FROM gestion.usuario_interno) = 1, 'H21 tampoco se borra el usuario';
END $$;

SELECT pg_temp.nuevo('t21-derivada', '9210');
SELECT set_config('app.actor', 'sistema:ia', false);
UPDATE chatbot.incidencia_paciente SET categoria_ia_id = 2, categoria_confianza = 80, version_clasificador = 'v1' WHERE trace_id = 't21-derivada';
SELECT set_config('app.actor', 'usuario:gestor-21', false);
UPDATE chatbot.incidencia_paciente SET area_destino_id = (SELECT id FROM catalogo.area WHERE codigo = 'EESS-6215') WHERE trace_id = 't21-derivada';
SELECT pg_temp.espera_error($q$SELECT catalogo.retirar_hospitales_fase_1()$q$, '23001', '%6215 (incidencias: 0, derivaciones: 1, usuarios: 0)%',
  'H22 un hospital al que se le derivo una incidencia no se retira');

TRUNCATE gestion.usuario_interno CASCADE;
TRUNCATE chatbot.incidencia_etiqueta, chatbot.archivo_recibido, chatbot.solicitud_carga, chatbot.evidencia, chatbot.incidencia_paciente_auditoria,
         ia.entrenamiento_categoria, chatbot.incidencia_analisis, chatbot.incidencia_paciente, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion;

SELECT pg_temp.usuario('t21.diris-le@minsa.gob.pe', 'DIRIS-LE');
DO $$
BEGIN
  ASSERT catalogo.retirar_hospitales_fase_1() = 4, 'H23 sin datos asociados el retiro quita los 4 hospitales';
  ASSERT (SELECT count(*) FROM catalogo.establecimiento_salud WHERE codigo_renipress IN ('6206', '5946', '6215', '33381')) = 0, 'H23 ya no hay establecimientos de la primera etapa';
  ASSERT (SELECT count(*) FROM catalogo.area WHERE codigo IN ('EESS-6206', 'EESS-5946', 'EESS-6215', 'EESS-33381')) = 0, 'H23 ni sus areas';
  ASSERT (SELECT count(*) FROM catalogo.establecimiento_salud WHERE codigo_renipress = '9210') = 1, 'H23 otros establecimientos no se tocan';
  ASSERT (SELECT string_agg(codigo, ',' ORDER BY codigo) FROM catalogo.area WHERE codigo LIKE 'DIRIS-%') = 'DIRIS-LC,DIRIS-LE',
    'H24 las DIRIS se quedan si una tiene un area hija ajena y la otra un usuario';
END $$;

TRUNCATE gestion.usuario_interno CASCADE;
DO $$
BEGIN
  ASSERT catalogo.retirar_hospitales_fase_1() = 0, 'H25 repetir el retiro no hace nada y devuelve 0';
  ASSERT (SELECT string_agg(codigo, ',' ORDER BY codigo) FROM catalogo.area WHERE codigo LIKE 'DIRIS-%') = 'DIRIS-LC', 'H25 DIRIS-LE queda libre y se va; DIRIS-LC sigue con su area hija';
END $$;

DELETE FROM catalogo.establecimiento_salud WHERE codigo_renipress = '9210';
DELETE FROM catalogo.area WHERE codigo = 'T21-ORIGEN';
DO $$
BEGIN
  ASSERT catalogo.retirar_hospitales_fase_1() = 0, 'H26 sin hospitales el retiro devuelve 0';
  ASSERT (SELECT count(*) FROM catalogo.area) = 1 AND (SELECT count(*) FROM catalogo.establecimiento_salud) = 0, 'H26 una DIRIS sin hijos, usuarios ni incidencias se retira y la base queda como al inicio (solo OTRANS)';
END $$;

DO $$
BEGIN
  ASSERT catalogo.cargar_hospitales_fase_1() = 4, 'H27 cargar despues de retirar vuelve a crear los 4';
  ASSERT pg_temp.contenido() = (SELECT c FROM contenido_1), 'H27 cargar, retirar y cargar deja el mismo estado';
  ASSERT (SELECT count(*) FROM catalogo.area) = 7, 'H27 con las mismas 7 areas';
END $$;

SELECT set_config('app.actor', '', false);
DELETE FROM catalogo.establecimiento_salud;
DELETE FROM catalogo.area WHERE codigo <> 'OTRANS' AND padre_id IS NOT NULL;
DELETE FROM catalogo.area WHERE codigo <> 'OTRANS';

\echo TODAS LAS PRUEBAS DE HOSPITALES DE LA PRIMERA ETAPA PASARON
