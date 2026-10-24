SELECT set_config('app.actor', 'sistema:semilla', true);

INSERT INTO catalogo.nivel_atencion (id, codigo, nombre, descripcion, activo) VALUES
  (1, 'I', 'Nivel I', 'Primer nivel de atención', true),
  (2, 'II', 'Nivel II', 'Segundo nivel de atención', true),
  (3, 'III', 'Nivel III', 'Tercer nivel de atención', true)
ON CONFLICT (id) DO UPDATE SET
  codigo = EXCLUDED.codigo,
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  activo = EXCLUDED.activo
WHERE (nivel_atencion.codigo, nivel_atencion.nombre, nivel_atencion.descripcion, nivel_atencion.activo) IS DISTINCT FROM (EXCLUDED.codigo, EXCLUDED.nombre, EXCLUDED.descripcion, EXCLUDED.activo);

SELECT setval('catalogo.nivel_atencion_id_seq', (SELECT max(id) FROM catalogo.nivel_atencion));
