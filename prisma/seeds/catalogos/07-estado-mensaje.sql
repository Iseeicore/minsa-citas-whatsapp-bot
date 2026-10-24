SELECT set_config('app.actor', 'sistema:semilla', true);

INSERT INTO catalogo.estado_mensaje (id, codigo, nombre, descripcion, activo) VALUES
  (1, 'PENDIENTE', 'Pendiente', NULL, true),
  (2, 'ENVIADO', 'Enviado', NULL, true),
  (3, 'ENTREGADO', 'Entregado', NULL, true),
  (4, 'LEIDO', 'Leído', NULL, true),
  (5, 'FALLIDO', 'Fallido', NULL, true)
ON CONFLICT (id) DO UPDATE SET
  codigo = EXCLUDED.codigo,
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  activo = EXCLUDED.activo
WHERE (estado_mensaje.codigo, estado_mensaje.nombre, estado_mensaje.descripcion, estado_mensaje.activo) IS DISTINCT FROM (EXCLUDED.codigo, EXCLUDED.nombre, EXCLUDED.descripcion, EXCLUDED.activo);

SELECT setval('catalogo.estado_mensaje_id_seq', (SELECT max(id) FROM catalogo.estado_mensaje));
