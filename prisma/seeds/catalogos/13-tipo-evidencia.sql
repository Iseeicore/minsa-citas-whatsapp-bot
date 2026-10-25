SELECT set_config('app.actor', 'sistema:semilla', true);

INSERT INTO catalogo.tipo_evidencia (id, codigo, nombre, descripcion, activo) VALUES
  (1, 'IMAGEN', 'Imagen', NULL, true),
  (2, 'VIDEO', 'Video', NULL, true),
  (3, 'DOCUMENTO', 'Documento', NULL, true),
  (4, 'AUDIO', 'Audio', NULL, true)
ON CONFLICT (id) DO UPDATE SET
  codigo = EXCLUDED.codigo,
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  activo = EXCLUDED.activo
WHERE (tipo_evidencia.codigo, tipo_evidencia.nombre, tipo_evidencia.descripcion, tipo_evidencia.activo) IS DISTINCT FROM (EXCLUDED.codigo, EXCLUDED.nombre, EXCLUDED.descripcion, EXCLUDED.activo);

SELECT setval('catalogo.tipo_evidencia_id_seq', (SELECT max(id) FROM catalogo.tipo_evidencia));
