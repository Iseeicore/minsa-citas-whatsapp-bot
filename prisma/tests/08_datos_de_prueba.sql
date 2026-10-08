\set ON_ERROR_STOP on
\set QUIET on

-- La semilla de desarrollo necesita el padron: aqui se carga con el mismo cargador que usa `npm run db:seed:eess`, pero con tres
-- establecimientos de ejemplo en lugar de los 434.
CREATE TEMP TABLE eess_fuente (codigo_renipress text, nombre text, nivel text, categoria text, diris text, departamento text, provincia text, distrito text);
INSERT INTO eess_fuente VALUES
  ('6206', 'HOSPITAL NACIONAL DOS DE MAYO', 'III', NULL, 'DIRIS Lima Centro', NULL, NULL, NULL),
  ('5946', 'Hospital Nacional Hipólito Unanue', 'III', NULL, 'DIRIS Lima Este', NULL, NULL, NULL),
  ('5614', 'CENTRO DE SALUD BAYOVAR', 'I', 'I-3', 'DIRIS Lima Centro', 'Lima', 'Lima', 'San Juan de Lurigancho');
\ir ../seeds/eess/cargar_establecimientos.sql

\ir ../seeds/dev/incidencias_sinteticas.sql

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%') = 21, 'D01 se siembran 21 incidencias';
  ASSERT (SELECT count(*) FROM chatbot.evidencia WHERE ruta LIKE 'seed-dev/%') = 9, 'D02 se siembran 9 evidencias';

  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND estado_incidencia_id = 1) = 1, 'D03 una incidencia queda REGISTRADA';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND estado_incidencia_id = 2) = 5, 'D04 cinco quedan CLASIFICADAS';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND estado_incidencia_id = 6) = 3, 'D05 tres quedan DERIVADAS';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND estado_incidencia_id = 3) = 5, 'D06 cinco quedan EN_GESTION (una de ellas reabierta)';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND estado_incidencia_id = 4) = 1, 'D07 una queda RESUELTA y vigente';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND estado_incidencia_id = 7) = 6,
    'D08 seis quedan ARCHIVADAS: dos por su vigencia, una por vencer su plazo, dos por datos insuficientes y una porque no corresponde';

  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND categoria_ia_id IS NULL) = 1, 'D09 solo la REGISTRADA no tiene categoria de la IA';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND categoria_corregida_en IS NOT NULL) = 1, 'D10 una categoria fue corregida';
  ASSERT (SELECT categoria_id <> categoria_ia_id FROM chatbot.incidencia_paciente WHERE trace_id = 'seed-dev-007'), 'D11 la corregida difiere de la propuesta de la IA';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND categoria_confirmada_en IS NOT NULL) = 15, 'D12 quince categorias fueron confirmadas';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND categoria_ia_id IS NOT NULL
             AND categoria_confirmada_en IS NULL AND categoria_corregida_en IS NULL) = 4, 'D13 cuatro esperan la revision humana';

  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND es_anonimo) = 6, 'D14 seis son anonimas';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND dni_reclamante IS NOT NULL AND dni_reclamante NOT LIKE '0000%') = 0, 'D15 todo DNI sembrado es inventado';

  ASSERT (SELECT fecha_creacion < now() - interval '99 hours' FROM chatbot.incidencia_paciente WHERE trace_id = 'seed-dev-010'), 'D16 la incidencia 10 tiene mas de 99 horas de antiguedad';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND estado_incidencia_id IN (1, 2, 3, 6)
             AND fecha_creacion < now() - interval '72 hours') = 0, 'D17 ninguna abierta supera los 3 dias: la vencida ya se archivo';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente_auditoria a JOIN chatbot.incidencia_paciente i ON i.id = a.incidencia_paciente_id
           WHERE i.trace_id LIKE 'seed-dev-%' AND a.actor = 'sistema:archivado') = 2, 'D18 el historial guarda el archivado por vigencia hecho por el sistema';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente_auditoria a JOIN chatbot.incidencia_paciente i ON i.id = a.incidencia_paciente_id
           WHERE i.trace_id LIKE 'seed-dev-%' AND a.actor = 'sistema:vencimiento') = 1, 'D19 el historial guarda el archivado por vencimiento';
  ASSERT (SELECT estado_incidencia_id = 7 AND medidas_tomadas IS NULL FROM chatbot.incidencia_paciente WHERE trace_id = 'seed-dev-010'),
    'D20 la incidencia 10 se archivo por vencer su plazo, sin resolucion';
END $$;

DO $$
DECLARE
  v_otrans integer := (SELECT id FROM catalogo.area WHERE codigo = 'OTRANS');
BEGIN
  ASSERT (SELECT string_agg(e.codigo_renipress || '=' || n, ',' ORDER BY e.codigo_renipress)
            FROM (SELECT establecimiento_id, count(*) AS n FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' GROUP BY 1) o
            JOIN catalogo.establecimiento_salud e ON e.id = o.establecimiento_id) = '5614=7,5946=7,6206=7',
    'D21 las 21 incidencias se reparten siete en cada uno de los tres establecimientos de origen';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND establecimiento_id IS NULL) = 0, 'D21 todas tienen establecimiento de origen';

  ASSERT (SELECT string_agg(right(trace_id, 3), ',' ORDER BY trace_id) FROM chatbot.incidencia_paciente
           WHERE trace_id LIKE 'seed-dev-%' AND categoria_id = 1) = '005,009,013', 'D22 las denuncias por corrupcion son la 5, la 9 y la 13';
  ASSERT (SELECT bool_and(area_destino_id = v_otrans AND establecimiento_id IS NOT NULL) FROM chatbot.incidencia_paciente
           WHERE trace_id LIKE 'seed-dev-%' AND categoria_id = 1), 'D23 la corrupcion va a OTRANS y conserva su establecimiento de origen';

  ASSERT (SELECT bool_and(i.area_destino_id = e.area_id) FROM chatbot.incidencia_paciente i
            JOIN catalogo.establecimiento_salud e ON e.id = i.establecimiento_id
           WHERE i.trace_id LIKE 'seed-dev-%' AND i.categoria_id <> 1 AND i.estado_incidencia_id IN (3, 4, 6, 7) AND i.area_destino_id IS NOT NULL),
    'D24 queja y reclamo derivados van al area de su propio establecimiento';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND estado_incidencia_id IN (3, 6) AND area_destino_id IS NULL) = 0,
    'D24 todo caso derivado o en gestion tiene area de destino';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND estado_incidencia_id = 6
             AND derivado_en IS NOT NULL AND derivado_por = 'operador:gestor') = 3, 'D25 la base llena quien y cuando derivo';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND estado_incidencia_id = 3
             AND tomado_en IS NOT NULL AND tomado_por IN ('operador:area', 'usuario:seed-dev-revisor')) = 5, 'D25 la base llena quien y cuando tomo cada caso en gestion (la reabierta, quien la reabrio)';

  ASSERT (SELECT string_agg(right(i.trace_id, 3) || '=' || m.codigo || '/' || i.usuario_modificacion, ',' ORDER BY i.trace_id)
            FROM chatbot.incidencia_paciente i JOIN catalogo.motivo_archivo m ON m.id = i.motivo_archivo_id
           WHERE i.trace_id LIKE 'seed-dev-%')
         = '010=VENCIDA_SIN_ATENDER/sistema:vencimiento,012=RESUELTA_VIGENCIA/sistema:archivado,015=DATOS_INSUFICIENTES/sistema:filtro,018=RESUELTA_VIGENCIA/sistema:archivado,019=NO_CORRESPONDE/usuario:seed-dev-revisor,021=DATOS_INSUFICIENTES/usuario:seed-dev-revisor',
    'D26 cada archivado lleva su motivo y quien lo archivo';

  ASSERT (SELECT string_agg(e.codigo_renipress || ':' || right(i.trace_id, 3), ',' ORDER BY e.codigo_renipress, i.trace_id)
            FROM chatbot.incidencia_paciente i JOIN catalogo.establecimiento_salud e ON e.area_id = i.area_destino_id
           WHERE i.trace_id LIKE 'seed-dev-%')
         = '5614:003,5614:012,5614:015,5614:017,5614:021,5946:002,5946:007,5946:011,5946:014,5946:018,5946:020,6206:001,6206:004,6206:008,6206:010,6206:016,6206:019',
    'D27 lo que ve el area de cada establecimiento: todo caso no sensible clasificado, tambien los aun sin derivar';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND area_destino_id = v_otrans) = 3, 'D27 lo que ve OTRANS son las tres denuncias';
END $$;

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM gestion.usuario_interno WHERE correo LIKE '%@seed-dev.invalid') = 6, 'D28 se siembran seis usuarios internos de ejemplo';
  ASSERT (SELECT string_agg(r.codigo || '=' || coalesce(a.codigo, '-'), ',' ORDER BY u.correo)
            FROM gestion.usuario_interno u JOIN gestion.usuario_rol ur ON ur.usuario_interno_id = u.id JOIN gestion.rol r ON r.id = ur.rol_id
            LEFT JOIN catalogo.area a ON a.id = u.area_id WHERE u.correo LIKE '%@seed-dev.invalid')
         = 'ADMINISTRADOR=-,ESTABLECIMIENTO=EESS-5614,ESTABLECIMIENTO=EESS-6206,GESTOR=EESS-5614,OTRANS=OTRANS,ESTABLECIMIENTO=EESS-5946',
    'D29 administrador sin area, el gestor en un establecimiento, OTRANS en su area y tres usuarios de establecimiento en tres establecimientos distintos';
  ASSERT (SELECT max(n) FROM (SELECT count(*) AS n FROM gestion.usuario_interno WHERE activo AND area_id IN (SELECT area_id FROM catalogo.establecimiento_salud) GROUP BY area_id) t) <= 3,
    'D29b ningun establecimiento pasa de 3 usuarios activos';
  ASSERT (SELECT bool_and(password_hash ~ '^\$argon2id\$') FROM gestion.usuario_interno WHERE correo LIKE '%@seed-dev.invalid'),
    'D30 los usuarios llevan una huella con formato Argon2id y no una clave';
  ASSERT (SELECT count(DISTINCT password_hash) FROM gestion.usuario_interno WHERE correo LIKE '%@seed-dev.invalid') = 1,
    'D30 todos comparten la misma huella desconocida (nadie puede iniciar sesion)';
END $$;

DO $$
BEGIN
  -- Resolucion en tres campos
  ASSERT (SELECT string_agg(right(i.trace_id, 3) || '=' || r.codigo, ',' ORDER BY i.trace_id)
            FROM chatbot.incidencia_paciente i JOIN catalogo.resultado_resolucion r ON r.id = i.resultado_resolucion_id
           WHERE i.trace_id LIKE 'seed-dev-%') = '008=ATENDIDO,012=ATENDIDO,018=CERRADO',
    'D31 las tres resueltas llevan su resultado';
  ASSERT (SELECT bool_and(medidas_tomadas IS NOT NULL AND fundamento IS NOT NULL) FROM chatbot.incidencia_paciente
           WHERE trace_id LIKE 'seed-dev-%' AND resultado_resolucion_id IS NOT NULL), 'D31 y sus medidas y su fundamento';
  -- Archivados a mano con justificacion, y un caso reabierto
  ASSERT (SELECT bool_and(archivo_detalle IS NOT NULL) FROM chatbot.incidencia_paciente
           WHERE trace_id LIKE 'seed-dev-%' AND estado_incidencia_id = 7 AND motivo_archivo_id IN (3, 4)), 'D32 todo archivado manual lleva su justificacion';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND reabierto_en IS NOT NULL) = 1, 'D33 un caso quedo reabierto';
  ASSERT (SELECT estado_incidencia_id = 3 AND archivado_en IS NULL AND motivo_archivo_id IS NULL AND archivo_detalle IS NULL
                  AND reabierto_por = 'usuario:seed-dev-revisor' AND reabierto_motivo IS NOT NULL
            FROM chatbot.incidencia_paciente WHERE trace_id = 'seed-dev-020'), 'D33 el reabierto vuelve a EN_GESTION sin rastro del archivado y con quien y por que';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente_auditoria a JOIN chatbot.incidencia_paciente i ON i.id = a.incidencia_paciente_id
           WHERE i.trace_id = 'seed-dev-020' AND a.cambios ? 'reabierto_motivo' AND a.operacion = 'ACTUALIZACION') = 1, 'D33 la auditoria guarda la reapertura';
  -- Entrenamiento: los archivados a mano no entran
  ASSERT (SELECT string_agg(right(i.trace_id, 3) || '=' || e.apto_entrenamiento, ',' ORDER BY i.trace_id)
            FROM ia.entrenamiento_categoria e JOIN chatbot.incidencia_paciente i ON i.id = e.incidencia_paciente_id
           WHERE i.trace_id IN ('seed-dev-019', 'seed-dev-020', 'seed-dev-021', 'seed-dev-012')) = '012=true,019=false,020=true,021=false',
    'D34 los casos archivados a mano salen del entrenamiento, el reabierto vuelve y los demas siguen aptos';
END $$;

TRUNCATE chatbot.archivo_recibido, chatbot.solicitud_carga, chatbot.evidencia, chatbot.incidencia_paciente_auditoria,
         ia.entrenamiento_categoria, chatbot.incidencia_analisis, chatbot.incidencia_paciente, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion;

\echo TODAS LAS PRUEBAS DE DATOS DE PRUEBA PASARON
