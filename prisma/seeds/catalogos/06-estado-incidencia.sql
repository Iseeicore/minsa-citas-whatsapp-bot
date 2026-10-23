SELECT set_config('app.actor', 'sistema:semilla', true);

INSERT INTO catalogo.estado_incidencia (id, codigo, nombre, descripcion, activo) VALUES
  (1, 'REGISTRADO', 'Registrado', 'Recibido por el chatbot, sin categoría', true),
  (2, 'CLASIFICADO', 'Clasificado', 'La IA ya asignó una categoría', true),
  (3, 'EN_GESTION', 'En gestión', 'El área competente la está atendiendo', true),
  (4, 'RESUELTO', 'Resuelto', 'Tiene resolución; se archiva a los 3 días', true),
  (5, 'ANULADO', 'Anulado', 'Retirado: anular una incidencia es su borrado lógico (activo = false)', false),
  (6, 'DERIVADO', 'Derivado', 'Enviado al área competente según su categoría', true),
  (7, 'ARCHIVADO', 'Archivado', 'Resuelto hace más de la vigencia, o abierto que superó el plazo de atención: archivado automáticamente', true)
ON CONFLICT (id) DO UPDATE SET
  codigo = EXCLUDED.codigo,
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  activo = EXCLUDED.activo
WHERE (estado_incidencia.codigo, estado_incidencia.nombre, estado_incidencia.descripcion, estado_incidencia.activo) IS DISTINCT FROM (EXCLUDED.codigo, EXCLUDED.nombre, EXCLUDED.descripcion, EXCLUDED.activo);

SELECT setval('catalogo.estado_incidencia_id_seq', (SELECT max(id) FROM catalogo.estado_incidencia));
