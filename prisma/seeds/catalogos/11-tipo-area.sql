SELECT set_config('app.actor', 'sistema:semilla', true);

INSERT INTO catalogo.tipo_area (id, codigo, nombre, descripcion, recibe_sensibles, activo) VALUES
  (1, 'ESTABLECIMIENTO', 'Establecimiento de salud', 'Área de un establecimiento de salud', false, true),
  (2, 'OTRANS', 'Oficina de transparencia', 'Área que atiende las denuncias sensibles (corrupción)', true, true),
  (3, 'DIRIS', 'DIRIS', 'Dirección de Redes Integradas de Salud', false, true),
  (4, 'INSTITUTO', 'Instituto', 'Instituto especializado', false, true),
  (5, 'ORGANISMO', 'Organismo o programa', 'Organismo público adscrito o programa nacional del MINSA (SIS, SUSALUD, INS, FISSAL, CENARES, PRONIS)', false, true)
ON CONFLICT (id) DO UPDATE SET
  codigo = EXCLUDED.codigo,
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  recibe_sensibles = EXCLUDED.recibe_sensibles,
  activo = EXCLUDED.activo
WHERE (tipo_area.codigo, tipo_area.nombre, tipo_area.descripcion, tipo_area.recibe_sensibles, tipo_area.activo) IS DISTINCT FROM (EXCLUDED.codigo, EXCLUDED.nombre, EXCLUDED.descripcion, EXCLUDED.recibe_sensibles, EXCLUDED.activo);

SELECT setval('catalogo.tipo_area_id_seq', (SELECT max(id) FROM catalogo.tipo_area));
