SELECT set_config('app.actor', 'sistema:semilla', true);

INSERT INTO catalogo.estado_conversacion (id, codigo, nombre, descripcion, activo) VALUES
  (1, 'ABIERTA', 'Abierta', NULL, true),
  (2, 'CERRADA', 'Cerrada', NULL, true)
ON CONFLICT (id) DO UPDATE SET
  codigo = EXCLUDED.codigo,
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  activo = EXCLUDED.activo
WHERE (estado_conversacion.codigo, estado_conversacion.nombre, estado_conversacion.descripcion, estado_conversacion.activo) IS DISTINCT FROM (EXCLUDED.codigo, EXCLUDED.nombre, EXCLUDED.descripcion, EXCLUDED.activo);

SELECT setval('catalogo.estado_conversacion_id_seq', (SELECT max(id) FROM catalogo.estado_conversacion));
