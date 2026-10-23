SELECT set_config('app.actor', 'sistema:semilla', true);

INSERT INTO catalogo.tipo_mensaje (id, codigo, nombre, descripcion, activo) VALUES
  (1, 'TEXTO', 'Texto', NULL, true),
  (2, 'IMAGEN', 'Imagen', NULL, true),
  (3, 'AUDIO', 'Audio', NULL, true),
  (4, 'DOCUMENTO', 'Documento', NULL, true),
  (5, 'UBICACION', 'Ubicación', NULL, true),
  (6, 'PLANTILLA', 'Plantilla', NULL, true),
  (7, 'DESCONOCIDO', 'Desconocido', NULL, true)
ON CONFLICT (id) DO UPDATE SET
  codigo = EXCLUDED.codigo,
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  activo = EXCLUDED.activo
WHERE (tipo_mensaje.codigo, tipo_mensaje.nombre, tipo_mensaje.descripcion, tipo_mensaje.activo) IS DISTINCT FROM (EXCLUDED.codigo, EXCLUDED.nombre, EXCLUDED.descripcion, EXCLUDED.activo);

SELECT setval('catalogo.tipo_mensaje_id_seq', (SELECT max(id) FROM catalogo.tipo_mensaje));
