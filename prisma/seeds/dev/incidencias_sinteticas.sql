\set ON_ERROR_STOP on
\set QUIET on

-- Datos de prueba para desarrollo: usuarios internos de ejemplo y 18 incidencias sinteticas repartidas en tres establecimientos.
-- Necesita el padron de establecimientos: correr antes `npm run db:seed:eess` (usa el Hospital Nacional Dos de Mayo 6206, el
-- Hospital Nacional Hipolito Unanue 5946 y el Centro de Salud Bayovar 5614).

DO $$
BEGIN
  IF (SELECT count(*) FROM catalogo.establecimiento_salud WHERE codigo_renipress IN ('6206', '5946', '5614')) < 3 THEN
    RAISE EXCEPTION 'Faltan los establecimientos 6206, 5946 y 5614: corre primero npm run db:seed:eess';
  END IF;
END $$;

-- Los usuarios no llevan clave en ningun archivo. Si quien siembra no trae una huella propia (variable hash_clave, que arma
-- scripts/db-seed-dev.mjs desde SEED_DEV_PASSWORD_HASH), la base recibe una huella al azar que nadie conoce: los usuarios
-- existen para probar areas y permisos, pero nadie puede iniciar sesion con ellos hasta que se les ponga una huella real.
\if :{?hash_clave}
\else
  SELECT '$argon2id$v=19$m=65536,t=3,p=4$' || rtrim(encode(sha256(uuidv7()::text::bytea), 'base64'), '=')
         || '$' || rtrim(encode(sha256(uuidv7()::text::bytea), 'base64'), '=') AS hash_clave \gset
\endif

DO $$ BEGIN PERFORM set_config('app.actor', 'sistema:seed-dev', false); END $$;

INSERT INTO gestion.usuario_interno (nombre_completo, correo, password_hash, area_id)
SELECT v.nombre, v.correo, :'hash_clave', (SELECT a.id FROM catalogo.area a WHERE a.codigo = v.area)
  FROM (VALUES
    ('Administrador de prueba',            'admin@seed-dev.invalid',       NULL::text),
    ('Gestor de prueba',                   'gestor@seed-dev.invalid',      NULL),
    ('OTRANS de prueba',                   'otrans@seed-dev.invalid',      'OTRANS'),
    ('Dos de Mayo de prueba',              'dosdemayo@seed-dev.invalid',   'EESS-6206'),
    ('Hipolito Unanue de prueba',          'unanue@seed-dev.invalid',      'EESS-5946'),
    ('Centro de Salud Bayovar de prueba',  'bayovar@seed-dev.invalid',     'EESS-5614')
  ) AS v(nombre, correo, area)
ON CONFLICT (correo) DO NOTHING;

INSERT INTO gestion.usuario_rol (usuario_interno_id, rol_id)
SELECT u.id, r.id
  FROM (VALUES
    ('admin@seed-dev.invalid',     'ADMINISTRADOR'),
    ('gestor@seed-dev.invalid',    'GESTOR'),
    ('otrans@seed-dev.invalid',    'OTRANS'),
    ('dosdemayo@seed-dev.invalid', 'ESTABLECIMIENTO'),
    ('unanue@seed-dev.invalid',    'ESTABLECIMIENTO'),
    ('bayovar@seed-dev.invalid',   'ESTABLECIMIENTO')
  ) AS v(correo, rol)
  JOIN gestion.usuario_interno u ON u.correo = v.correo
  JOIN gestion.rol r ON r.codigo = v.rol
ON CONFLICT (usuario_interno_id, rol_id) DO NOTHING;

CREATE TEMP TABLE edades (traza text PRIMARY KEY, horas_llegada integer NOT NULL, horas_resolucion integer);

-- p_eess: RENIPRESS del establecimiento de origen. p_destino: NULL (la categoria sensible ya la asigno la base a OTRANS) o
-- 'ORIGEN' (se deriva al area del propio establecimiento). p_archivo: NULL o 'DATOS_INSUFICIENTES' (lo archiva el filtro).
CREATE FUNCTION pg_temp.sembrar(
  p_n integer,
  p_horas_llegada integer,
  p_eess text,
  p_descripcion text,
  p_nombre text,
  p_dni text,
  p_categoria_ia integer,
  p_confianza numeric,
  p_revision text,
  p_categoria_final integer,
  p_estado text,
  p_destino text,
  p_resolucion text,
  p_horas_resolucion integer,
  p_archivo text
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_traza text := 'seed-dev-' || lpad(p_n::text, 3, '0');
  v_wa text := 'seed-wa-' || lpad(p_n::text, 3, '0');
  v_usuario uuid;
  v_id uuid;
  v_area_origen integer;
  v_categoria_vigente integer := coalesce(p_categoria_final, p_categoria_ia);
BEGIN
  PERFORM set_config('app.actor', 'ciudadano:seed-dev', false);
  INSERT INTO chatbot.usuario (wa_id) VALUES (v_wa) RETURNING id INTO v_usuario;
  INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, dni_reclamante, nombre_reclamante, descripcion, trace_id, establecimiento_id)
  SELECT 1, v_usuario, v_wa, p_nombre IS NULL, p_dni, p_nombre, p_descripcion, v_traza, e.id
    FROM catalogo.establecimiento_salud e WHERE e.codigo_renipress = p_eess
  RETURNING id INTO v_id;
  INSERT INTO edades VALUES (v_traza, p_horas_llegada, p_horas_resolucion);

  IF p_categoria_ia IS NOT NULL THEN
    PERFORM set_config('app.actor', 'sistema:ia', false);
    UPDATE chatbot.incidencia_paciente
       SET categoria_ia_id = p_categoria_ia, categoria_confianza = p_confianza, version_clasificador = 'v0.3'
     WHERE id = v_id;
  END IF;

  IF p_revision = 'confirmada' THEN
    PERFORM set_config('app.actor', 'operador:gestor', false);
    UPDATE chatbot.incidencia_paciente SET categoria_confirmada_en = now() WHERE id = v_id;
  ELSIF p_revision = 'corregida' THEN
    PERFORM set_config('app.actor', 'operador:gestor', false);
    UPDATE chatbot.incidencia_paciente SET categoria_id = p_categoria_final WHERE id = v_id;
  END IF;

  SELECT area_id INTO v_area_origen FROM catalogo.establecimiento_salud WHERE codigo_renipress = p_eess;

  -- Una denuncia por corrupcion ya quedo en OTRANS al clasificarse (la asigna la base): OTRANS la toma directo, sin derivar.
  IF p_estado = 'DERIVADO' OR (p_estado IN ('EN_GESTION', 'RESUELTO') AND v_categoria_vigente <> 1) THEN
    PERFORM set_config('app.actor', 'operador:gestor', false);
    UPDATE chatbot.incidencia_paciente
       SET estado_incidencia_id = 6,
           area_destino_id = CASE WHEN p_destino = 'ORIGEN' THEN v_area_origen ELSE area_destino_id END
     WHERE id = v_id;
  END IF;

  IF p_estado IN ('EN_GESTION', 'RESUELTO') THEN
    PERFORM set_config('app.actor', 'operador:area', false);
    UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3 WHERE id = v_id;
  END IF;

  IF p_estado = 'RESUELTO' THEN
    PERFORM set_config('app.actor', 'operador:area', false);
    UPDATE chatbot.incidencia_paciente
       SET medidas_tomadas = p_resolucion,
           fundamento = 'La atencion corresponde a lo reportado por el paciente',
           resultado_resolucion_id = (SELECT id FROM catalogo.resultado_resolucion WHERE codigo = 'ATENDIDO')
     WHERE id = v_id;
  END IF;

  IF p_archivo = 'DATOS_INSUFICIENTES' THEN
    PERFORM set_config('app.actor', 'sistema:filtro', false);
    UPDATE chatbot.incidencia_paciente
       SET estado_incidencia_id = 7, motivo_archivo_id = (SELECT id FROM catalogo.motivo_archivo WHERE codigo = 'DATOS_INSUFICIENTES'),
           archivo_detalle = 'El mensaje no describe ninguna queja ni reclamo'
     WHERE id = v_id;
  END IF;
END;
$$;

CREATE FUNCTION pg_temp.evidencia(p_n integer, p_tipo integer, p_mime text, p_nombre text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.actor', 'ciudadano:seed-dev', false);
  INSERT INTO chatbot.evidencia (incidencia_paciente_id, tipo_evidencia_id, mime_type, nombre_archivo, tamano, ruta)
  SELECT id, p_tipo, p_mime, p_nombre, 2048, 'seed-dev/' || p_nombre
    FROM chatbot.incidencia_paciente WHERE trace_id = 'seed-dev-' || lpad(p_n::text, 3, '0');
END;
$$;

-- Origen: 6206 Hospital Nacional Dos de Mayo, 5946 Hospital Nacional Hipolito Unanue, 5614 Centro de Salud Bayovar (seis cada uno).
DO $$
BEGIN
  PERFORM pg_temp.sembrar(1, 50, '6206', 'Me cobraron 40 soles por un medicamento que según el afiche de la farmacia debía ser gratuito para mi seguro.', 'María Q.', '00004821', 3, 92, 'confirmada', NULL, 'EN_GESTION', 'ORIGEN', NULL, NULL, NULL);
  PERFORM pg_temp.sembrar(2, 20, '5946', 'Pedí cita con cardiología hace dos meses y todavía no me dan fecha. Me dicen que vuelva a llamar.', 'Luis A.', '00001907', 3, 58, 'ninguna', NULL, 'CLASIFICADO', NULL, NULL, NULL, NULL);
  PERFORM pg_temp.sembrar(3, 30, '5614', 'La técnica de admisión me gritó delante de todos cuando pregunté dónde sacar mi ticket.', NULL, NULL, 2, 88, 'confirmada', NULL, 'EN_GESTION', 'ORIGEN', NULL, NULL, NULL);
  PERFORM pg_temp.sembrar(4, 26, '6206', 'No hay losartán hace tres semanas en la farmacia y me mandan a comprarlo afuera.', 'Rosa T.', '00007730', 3, 79, 'confirmada', NULL, 'DERIVADO', 'ORIGEN', NULL, NULL, NULL);
  PERFORM pg_temp.sembrar(5, 60, '5946', 'Un trabajador del módulo de admisión me pidió dinero aparte para darme el turno más temprano.', NULL, NULL, 1, 95, 'confirmada', NULL, 'EN_GESTION', NULL, NULL, NULL, NULL);
  PERFORM pg_temp.sembrar(6, 3, '5614', 'Hola, quisiera saber si atienden los sábados.', NULL, NULL, NULL, NULL, 'ninguna', NULL, 'REGISTRADO', NULL, NULL, NULL, NULL);
  PERFORM pg_temp.sembrar(7, 40, '5946', 'El laboratorio perdió mi muestra y tengo que repetir el examen, pero me quieren cobrar de nuevo.', 'Pedro S.', '00003350', 2, 61, 'corregida', 3, 'EN_GESTION', 'ORIGEN', NULL, NULL, NULL);
  PERFORM pg_temp.sembrar(8, 60, '6206', 'El consultorio abre una hora después del horario que dice el letrero.', 'Carmen V.', '00002214', 2, 90, 'confirmada', NULL, 'RESUELTO', 'ORIGEN', 'Se explicó al paciente el horario vigente y se colocó el aviso en la puerta del consultorio.', 20, NULL);
  PERFORM pg_temp.sembrar(9, 24, '5614', 'Un médico me dijo que podía operarme antes si le daba un apoyo en efectivo.', NULL, NULL, 1, 97, 'confirmada', NULL, 'DERIVADO', NULL, NULL, NULL, NULL);
  PERFORM pg_temp.sembrar(10, 100, '6206', 'Pagué una consulta que el SIS cubre y no me devuelven el dinero.', 'Julio M.', '00006098', 3, 64, 'confirmada', NULL, 'EN_GESTION', 'ORIGEN', NULL, NULL, NULL);
  PERFORM pg_temp.sembrar(11, 18, '5946', 'En emergencia me dejaron esperando tres horas y nadie me explicó nada. Una enfermera se burló de mi dolor.', 'Ana P.', '00008841', 2, 52, 'ninguna', NULL, 'CLASIFICADO', NULL, NULL, NULL, NULL);
  PERFORM pg_temp.sembrar(12, 150, '5614', 'Pedí copia de mi historia clínica y no me la entregan.', 'Rafael D.', '00005502', 3, 86, 'confirmada', NULL, 'RESUELTO', 'ORIGEN', 'Se entregó la copia de la historia clínica solicitada.', 80, NULL);
  PERFORM pg_temp.sembrar(13, 10, '6206', 'Las citas se las dan primero a conocidos del personal, aunque uno llegue a las cinco de la mañana.', NULL, NULL, 1, 74, 'ninguna', NULL, 'CLASIFICADO', NULL, NULL, NULL, NULL);
  PERFORM pg_temp.sembrar(14, 52, '5946', 'Los baños de la sala de espera están sin agua desde hace una semana.', 'Teresa L.', '00009013', 2, 69, 'confirmada', NULL, 'DERIVADO', 'ORIGEN', NULL, NULL, NULL);
  PERFORM pg_temp.sembrar(15, 8, '5614', 'Mi hijo tiene tos hace días, ¿qué me recomiendan?', NULL, NULL, 4, 41, 'ninguna', NULL, 'CLASIFICADO', NULL, NULL, NULL, 'DATOS_INSUFICIENTES');
  PERFORM pg_temp.sembrar(16, 12, '6206', 'Me reprogramaron la cita de traumatología tres veces sin avisarme.', 'Hugo F.', '00001176', 3, 77, 'confirmada', NULL, 'CLASIFICADO', NULL, NULL, NULL, NULL);
  PERFORM pg_temp.sembrar(17, 14, '5614', 'El vigilante no me dejó entrar con mi mamá, que es adulta mayor y necesita ayuda para caminar.', 'Gloria R.', '00004467', 2, 83, 'confirmada', NULL, 'CLASIFICADO', NULL, NULL, NULL, NULL);
  PERFORM pg_temp.sembrar(18, 220, '5946', 'La sala de espera de pediatría estaba sucia.', 'Nora C.', '00003021', 2, 91, 'confirmada', NULL, 'RESUELTO', 'ORIGEN', 'Se reforzó la limpieza de la sala y se informó al paciente.', 100, NULL);

  PERFORM pg_temp.evidencia(1, 1, 'image/jpeg', 'foto-boleta.jpg');
  PERFORM pg_temp.evidencia(1, 1, 'image/jpeg', 'afiche-farmacia.jpg');
  PERFORM pg_temp.evidencia(3, 4, 'audio/ogg', 'audio-admision.ogg');
  PERFORM pg_temp.evidencia(4, 1, 'image/jpeg', 'receta.jpg');
  PERFORM pg_temp.evidencia(5, 1, 'image/png', 'captura-mensaje.png');
  PERFORM pg_temp.evidencia(7, 3, 'application/pdf', 'orden-examen.pdf');
  PERFORM pg_temp.evidencia(9, 1, 'image/png', 'captura-conversacion.png');
  PERFORM pg_temp.evidencia(9, 4, 'audio/ogg', 'nota-voz.ogg');
  PERFORM pg_temp.evidencia(14, 1, 'image/jpeg', 'foto-bano.jpg');
END $$;

ALTER TABLE chatbot.incidencia_paciente DISABLE TRIGGER USER;
UPDATE chatbot.incidencia_paciente i
   SET fecha_creacion = now() - make_interval(hours => e.horas_llegada),
       resuelto_en = CASE WHEN e.horas_resolucion IS NULL THEN i.resuelto_en ELSE now() - make_interval(hours => e.horas_resolucion) END
  FROM edades e
 WHERE i.trace_id = e.traza;
ALTER TABLE chatbot.incidencia_paciente ENABLE TRIGGER USER;

SELECT chatbot.archivar_incidencias_resueltas(3, 1000) AS archivadas_por_vigencia,
       chatbot.archivar_incidencias_vencidas(3, 1000) AS archivadas_por_vencimiento;

\echo Datos de prueba sembrados:
SELECT e.nombre AS estado, count(*) AS incidencias
  FROM chatbot.incidencia_paciente i JOIN catalogo.estado_incidencia e ON e.id = i.estado_incidencia_id
 WHERE i.trace_id LIKE 'seed-dev-%'
 GROUP BY e.nombre, e.id ORDER BY e.id;
