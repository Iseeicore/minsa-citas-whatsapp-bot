SELECT set_config('app.actor', 'sistema:semilla', true);

INSERT INTO gestion.rol (id, codigo, nombre, descripcion, tipo_area_id, activo) VALUES
  (1, 'ADMINISTRADOR', 'Administrador', 'Gestiona usuarios y roles; ve indicadores, métricas y análisis de todos los procesos', NULL, true),
  (2, 'GESTOR', 'Gestor', 'Revisa la categoría que asignó la IA (la confirma o la corrige una sola vez), archiva, reabre y resuelve los casos de su establecimiento; pertenece siempre a un establecimiento y no ve las denuncias por corrupción', 1, true),
  (3, 'OTRANS', 'OTRANS', 'Revisa (confirma o corrige) las denuncias por corrupción, las toma directo en gestión y las resuelve; es la única que las ve, además del administrador', 2, true),
  (4, 'ESTABLECIMIENTO', 'Responsable de establecimiento', 'Hace con los casos de su establecimiento lo mismo que el gestor (quejas, reclamos y otros) y, además, gestiona los usuarios de su establecimiento', 1, true),
  (5, 'DIRIS', 'DIRIS', 'Atiende las quejas y los reclamos de los establecimientos de su DIRIS. Desactivado hasta que el área usuaria lo confirme', 3, false)
ON CONFLICT (id) DO UPDATE SET
  codigo = EXCLUDED.codigo,
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  tipo_area_id = EXCLUDED.tipo_area_id,
  activo = EXCLUDED.activo
WHERE (rol.codigo, rol.nombre, rol.descripcion, rol.tipo_area_id, rol.activo) IS DISTINCT FROM (EXCLUDED.codigo, EXCLUDED.nombre, EXCLUDED.descripcion, EXCLUDED.tipo_area_id, EXCLUDED.activo);

SELECT setval('gestion.rol_id_seq', (SELECT max(id) FROM gestion.rol));
