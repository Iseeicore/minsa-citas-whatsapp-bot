-- Datos de prueba SINTETICOS para desarrollo y demostracion. NUNCA va en una migracion ni en una base real:
-- lo corre scripts/db-seed-dev.mjs solo contra una base desechable o local. No hay personas reales: los nombres y los DNI
-- son inventados (DNI que empiezan con 0000) y los archivos no existen (solo hay filas de evidencia).
--
-- Usa las MISMAS operaciones que la aplicacion (la IA clasifica, una persona confirma o corrige, el gestor deriva, el area
-- atiende y resuelve), asi que la base aplica sus reglas de verdad. Solo para dar edad a los casos apaga los disparadores
-- de usuario un momento y despues los vuelve a encender.
--
-- Ids de catalogo: categoria 1 DENUNCIA_CORRUPCION, 2 QUEJA, 3 RECLAMO, 4 OTRO; estado 6 DERIVADO, 3 EN_GESTION;
-- tipo de evidencia 1 IMAGEN, 3 DOCUMENTO, 4 AUDIO.
\set ON_ERROR_STOP on
\set QUIET on

CREATE TEMP TABLE edades (traza text PRIMARY KEY, horas_llegada integer NOT NULL, horas_resolucion integer);

CREATE FUNCTION pg_temp.sembrar(
  p_n integer,
  p_horas_llegada integer,
  p_descripcion text,
  p_nombre text,
  p_dni text,
  p_categoria_ia integer,
  p_confianza numeric,
  p_revision text,
  p_categoria_final integer,
  p_estado text,
  p_resolucion text,
  p_horas_resolucion integer
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_traza text := 'seed-dev-' || lpad(p_n::text, 3, '0');
  v_wa text := 'seed-wa-' || lpad(p_n::text, 3, '0');
  v_usuario uuid;
  v_id uuid;
BEGIN
  PERFORM set_config('app.actor', 'ciudadano:seed-dev', false);
  INSERT INTO chatbot.usuario (wa_id) VALUES (v_wa) RETURNING id INTO v_usuario;
  INSERT INTO chatbot.incidencia_paciente (canal_origen_id, usuario_id, wa_id, es_anonimo, dni_reclamante, nombre_reclamante, descripcion, trace_id)
  VALUES (1, v_usuario, v_wa, p_nombre IS NULL, p_dni, p_nombre, p_descripcion, v_traza)
  RETURNING id INTO v_id;
  INSERT INTO edades VALUES (v_traza, p_horas_llegada, p_horas_resolucion);

  IF p_categoria_ia IS NOT NULL THEN
    PERFORM set_config('app.actor', 'sistema:ia', false);
    UPDATE chatbot.incidencia_paciente
       SET categoria_ia_id = p_categoria_ia, categoria_confianza = p_confianza, version_clasificador = 'v0.3'
     WHERE id = v_id;
  END IF;

  IF p_revision = 'confirmada' THEN
    PERFORM set_config('app.actor', 'operador:revisor', false);
    UPDATE chatbot.incidencia_paciente SET categoria_confirmada_en = now() WHERE id = v_id;
  ELSIF p_revision = 'corregida' THEN
    PERFORM set_config('app.actor', 'operador:revisor', false);
    UPDATE chatbot.incidencia_paciente SET categoria_id = p_categoria_final WHERE id = v_id;
  END IF;

  IF p_estado IN ('DERIVADO', 'EN_GESTION', 'RESUELTO') THEN
    PERFORM set_config('app.actor', 'operador:gestor', false);
    UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 6 WHERE id = v_id;
  END IF;

  IF p_estado IN ('EN_GESTION', 'RESUELTO') THEN
    PERFORM set_config('app.actor', 'operador:area', false);
    UPDATE chatbot.incidencia_paciente SET estado_incidencia_id = 3 WHERE id = v_id;
  END IF;

  IF p_estado = 'RESUELTO' THEN
    PERFORM set_config('app.actor', 'operador:area', false);
    UPDATE chatbot.incidencia_paciente SET resolucion = p_resolucion WHERE id = v_id;
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

-- sembrar(n, horas desde la llegada, descripcion, nombre, dni, categoria IA, confianza, revision, categoria final, estado,
--         resolucion, horas desde la resolucion)
DO $$
BEGIN
  PERFORM pg_temp.sembrar(1, 50, 'Me cobraron 40 soles por un medicamento que según el afiche de la farmacia debía ser gratuito para mi seguro.', 'María Q.', '00004821', 3, 92, 'confirmada', NULL, 'EN_GESTION', NULL, NULL);
  PERFORM pg_temp.sembrar(2, 20, 'Pedí cita con cardiología hace dos meses y todavía no me dan fecha. Me dicen que vuelva a llamar.', 'Luis A.', '00001907', 3, 58, 'ninguna', NULL, 'CLASIFICADO', NULL, NULL);
  PERFORM pg_temp.sembrar(3, 30, 'La técnica de admisión me gritó delante de todos cuando pregunté dónde sacar mi ticket.', NULL, NULL, 2, 88, 'confirmada', NULL, 'EN_GESTION', NULL, NULL);
  PERFORM pg_temp.sembrar(4, 26, 'No hay losartán hace tres semanas en la farmacia y me mandan a comprarlo afuera.', 'Rosa T.', '00007730', 3, 79, 'confirmada', NULL, 'DERIVADO', NULL, NULL);
  PERFORM pg_temp.sembrar(5, 60, 'Un trabajador del módulo de admisión me pidió dinero aparte para darme el turno más temprano.', NULL, NULL, 1, 95, 'confirmada', NULL, 'EN_GESTION', NULL, NULL);
  PERFORM pg_temp.sembrar(6, 3, 'Hola, quisiera saber si atienden los sábados.', NULL, NULL, NULL, NULL, 'ninguna', NULL, 'REGISTRADO', NULL, NULL);
  PERFORM pg_temp.sembrar(7, 40, 'El laboratorio perdió mi muestra y tengo que repetir el examen, pero me quieren cobrar de nuevo.', 'Pedro S.', '00003350', 2, 61, 'corregida', 3, 'EN_GESTION', NULL, NULL);
  PERFORM pg_temp.sembrar(8, 60, 'El consultorio abre una hora después del horario que dice el letrero.', 'Carmen V.', '00002214', 2, 90, 'confirmada', NULL, 'RESUELTO', 'Se explicó al paciente el horario vigente y se colocó el aviso en la puerta del consultorio.', 20);
  PERFORM pg_temp.sembrar(9, 24, 'Un médico me dijo que podía operarme antes si le daba un apoyo en efectivo.', NULL, NULL, 1, 97, 'confirmada', NULL, 'DERIVADO', NULL, NULL);
  PERFORM pg_temp.sembrar(10, 100, 'Pagué una consulta que el SIS cubre y no me devuelven el dinero.', 'Julio M.', '00006098', 3, 64, 'confirmada', NULL, 'EN_GESTION', NULL, NULL);
  PERFORM pg_temp.sembrar(11, 18, 'En emergencia me dejaron esperando tres horas y nadie me explicó nada. Una enfermera se burló de mi dolor.', 'Ana P.', '00008841', 2, 52, 'ninguna', NULL, 'CLASIFICADO', NULL, NULL);
  PERFORM pg_temp.sembrar(12, 150, 'Pedí copia de mi historia clínica y no me la entregan.', 'Rafael D.', '00005502', 3, 86, 'confirmada', NULL, 'RESUELTO', 'Se entregó la copia de la historia clínica solicitada.', 80);
  PERFORM pg_temp.sembrar(13, 10, 'Las citas se las dan primero a conocidos del personal, aunque uno llegue a las cinco de la mañana.', NULL, NULL, 1, 74, 'ninguna', NULL, 'CLASIFICADO', NULL, NULL);
  PERFORM pg_temp.sembrar(14, 52, 'Los baños de la sala de espera están sin agua desde hace una semana.', 'Teresa L.', '00009013', 2, 69, 'confirmada', NULL, 'DERIVADO', NULL, NULL);
  PERFORM pg_temp.sembrar(15, 8, 'Mi hijo tiene tos hace días, ¿qué me recomiendan?', NULL, NULL, 4, 41, 'ninguna', NULL, 'CLASIFICADO', NULL, NULL);
  PERFORM pg_temp.sembrar(16, 12, 'Me reprogramaron la cita de traumatología tres veces sin avisarme.', 'Hugo F.', '00001176', 3, 77, 'confirmada', NULL, 'CLASIFICADO', NULL, NULL);
  PERFORM pg_temp.sembrar(17, 14, 'El vigilante no me dejó entrar con mi mamá, que es adulta mayor y necesita ayuda para caminar.', 'Gloria R.', '00004467', 2, 83, 'confirmada', NULL, 'CLASIFICADO', NULL, NULL);
  PERFORM pg_temp.sembrar(18, 220, 'La sala de espera de pediatría estaba sucia.', 'Nora C.', '00003021', 2, 91, 'confirmada', NULL, 'RESUELTO', 'Se reforzó la limpieza de la sala y se informó al paciente.', 100);

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

-- Dar edad a los casos: la base fija la llegada y la resolucion en "ahora", asi que se corrigen con los disparadores apagados.
ALTER TABLE chatbot.incidencia_paciente DISABLE TRIGGER USER;
UPDATE chatbot.incidencia_paciente i
   SET fecha_creacion = now() - make_interval(hours => e.horas_llegada),
       resuelto_en = CASE WHEN e.horas_resolucion IS NULL THEN i.resuelto_en ELSE now() - make_interval(hours => e.horas_resolucion) END
  FROM edades e
 WHERE i.trace_id = e.traza;
ALTER TABLE chatbot.incidencia_paciente ENABLE TRIGGER USER;

-- El archivado automatico (3 dias de vigencia de la resolucion) pasa a ARCHIVADO lo que ya cumplio.
SELECT chatbot.archivar_incidencias_resueltas(3, 1000) AS archivadas_por_vigencia;

\echo Datos de prueba sembrados:
SELECT e.nombre AS estado, count(*) AS incidencias
  FROM chatbot.incidencia_paciente i JOIN catalogo.estado_incidencia e ON e.id = i.estado_incidencia_id
 WHERE i.trace_id LIKE 'seed-dev-%'
 GROUP BY e.nombre, e.id ORDER BY e.id;
