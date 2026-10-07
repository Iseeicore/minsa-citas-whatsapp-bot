\set ON_ERROR_STOP on
\set QUIET on

\ir ../seeds/dev/incidencias_sinteticas.sql

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%') = 18, 'D01 se siembran 18 incidencias';
  ASSERT (SELECT count(*) FROM chatbot.evidencia WHERE ruta LIKE 'seed-dev/%') = 9, 'D02 se siembran 9 evidencias';

  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND estado_incidencia_id = 1) = 1, 'D03 una incidencia queda REGISTRADA';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND estado_incidencia_id = 2) = 6, 'D04 seis quedan CLASIFICADAS';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND estado_incidencia_id = 6) = 3, 'D05 tres quedan DERIVADAS';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND estado_incidencia_id = 3) = 4, 'D06 cuatro quedan EN_GESTION';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND estado_incidencia_id = 4) = 1, 'D07 una queda RESUELTA y vigente';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND estado_incidencia_id = 7) = 3, 'D08 tres pasan a ARCHIVADAS: dos por su vigencia y una por vencer su plazo';

  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND categoria_ia_id IS NULL) = 1, 'D09 solo la REGISTRADA no tiene categoria de la IA';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND categoria_corregida_en IS NOT NULL) = 1, 'D10 una categoria fue corregida';
  ASSERT (SELECT categoria_id <> categoria_ia_id FROM chatbot.incidencia_paciente WHERE trace_id = 'seed-dev-007'), 'D11 la corregida difiere de la propuesta de la IA';
  ASSERT (SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%' AND categoria_confirmada_en IS NOT NULL) = 12, 'D12 doce categorias fueron confirmadas';
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
  ASSERT (SELECT estado_incidencia_id = 7 AND resolucion IS NULL FROM chatbot.incidencia_paciente WHERE trace_id = 'seed-dev-010'),
    'D20 la incidencia 10 se archivo por vencer su plazo, sin resolucion';
END $$;

TRUNCATE chatbot.archivo_recibido, chatbot.solicitud_carga, chatbot.evidencia, chatbot.incidencia_paciente_auditoria,
         ia.entrenamiento_categoria, chatbot.incidencia_paciente, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion;

\echo TODAS LAS PRUEBAS DE DATOS DE PRUEBA PASARON
