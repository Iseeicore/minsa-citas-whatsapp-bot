SELECT set_config('app.actor', 'sistema:semilla', true);

INSERT INTO catalogo.area (id, codigo, nombre, tipo_area_id, padre_id, activo) VALUES
  (1, 'OTRANS', 'OTRANS', 2, NULL, true)
ON CONFLICT (id) DO UPDATE SET
  codigo = EXCLUDED.codigo,
  nombre = EXCLUDED.nombre,
  tipo_area_id = EXCLUDED.tipo_area_id,
  padre_id = EXCLUDED.padre_id,
  activo = EXCLUDED.activo
WHERE (area.codigo, area.nombre, area.tipo_area_id, area.padre_id, area.activo) IS DISTINCT FROM (EXCLUDED.codigo, EXCLUDED.nombre, EXCLUDED.tipo_area_id, EXCLUDED.padre_id, EXCLUDED.activo);

SELECT setval('catalogo.area_id_seq', (SELECT max(id) FROM catalogo.area));
