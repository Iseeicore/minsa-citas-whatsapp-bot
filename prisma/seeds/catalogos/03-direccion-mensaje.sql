SELECT set_config('app.actor', 'sistema:semilla', true);

INSERT INTO catalogo.direccion_mensaje (id, codigo, nombre, descripcion, activo) VALUES
  (1, 'ENTRANTE', 'Entrante', 'Del ciudadano al bot', true),
  (2, 'SALIENTE', 'Saliente', 'Del bot al ciudadano', true)
ON CONFLICT (id) DO UPDATE SET
  codigo = EXCLUDED.codigo,
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  activo = EXCLUDED.activo
WHERE (direccion_mensaje.codigo, direccion_mensaje.nombre, direccion_mensaje.descripcion, direccion_mensaje.activo) IS DISTINCT FROM (EXCLUDED.codigo, EXCLUDED.nombre, EXCLUDED.descripcion, EXCLUDED.activo);

SELECT setval('catalogo.direccion_mensaje_id_seq', (SELECT max(id) FROM catalogo.direccion_mensaje));
