SELECT set_config('app.actor', 'sistema:semilla', true);

INSERT INTO gestion.rol_categoria (rol_id, categoria_incidencia_id) VALUES
  (1, 1),
  (1, 2),
  (1, 3),
  (1, 4),
  (2, 2),
  (2, 3),
  (2, 4),
  (3, 1),
  (4, 2),
  (4, 3),
  (4, 4),
  (5, 2),
  (5, 3)
ON CONFLICT (rol_id, categoria_incidencia_id) DO NOTHING;
