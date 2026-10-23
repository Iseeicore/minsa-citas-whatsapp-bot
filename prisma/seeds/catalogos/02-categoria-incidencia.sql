SELECT set_config('app.actor', 'sistema:semilla', true);

INSERT INTO catalogo.categoria_incidencia (id, codigo, nombre, descripcion, activo, es_sensible, plazo_dias_habiles, archiva_por_vencimiento) VALUES
  (1, 'DENUNCIA_CORRUPCION', 'Denuncia por corrupción', 'Presunto acto de corrupción', true, true, 3, false),
  (2, 'QUEJA', 'Queja', 'Inconformidad con la atención o con el personal', true, false, 30, true),
  (3, 'RECLAMO', 'Reclamo', 'Reclamo por un servicio o un derecho', true, false, 30, true),
  (4, 'OTRO', 'Otro / no clasificable', 'Texto que no es una denuncia por corrupción, una queja ni un reclamo, o que la IA no puede clasificar con seguridad: una persona decide', true, false, 30, true)
ON CONFLICT (id) DO UPDATE SET
  codigo = EXCLUDED.codigo,
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  activo = EXCLUDED.activo,
  es_sensible = EXCLUDED.es_sensible,
  plazo_dias_habiles = EXCLUDED.plazo_dias_habiles,
  archiva_por_vencimiento = EXCLUDED.archiva_por_vencimiento
WHERE (categoria_incidencia.codigo, categoria_incidencia.nombre, categoria_incidencia.descripcion, categoria_incidencia.activo, categoria_incidencia.es_sensible, categoria_incidencia.plazo_dias_habiles, categoria_incidencia.archiva_por_vencimiento) IS DISTINCT FROM (EXCLUDED.codigo, EXCLUDED.nombre, EXCLUDED.descripcion, EXCLUDED.activo, EXCLUDED.es_sensible, EXCLUDED.plazo_dias_habiles, EXCLUDED.archiva_por_vencimiento);

SELECT setval('catalogo.categoria_incidencia_id_seq', (SELECT max(id) FROM catalogo.categoria_incidencia));
