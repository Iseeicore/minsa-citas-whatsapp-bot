SELECT set_config('app.actor', 'sistema:semilla', true);

INSERT INTO catalogo.resultado_resolucion (id, codigo, nombre, descripcion, activo) VALUES
  (1, 'ATENDIDO', 'Atendido', 'Se atendió lo reportado y se tomaron medidas', true),
  (2, 'CERRADO', 'Cerrado', 'El caso se cierra sin más gestión', true)
ON CONFLICT (id) DO UPDATE SET
  codigo = EXCLUDED.codigo,
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  activo = EXCLUDED.activo
WHERE (resultado_resolucion.codigo, resultado_resolucion.nombre, resultado_resolucion.descripcion, resultado_resolucion.activo) IS DISTINCT FROM (EXCLUDED.codigo, EXCLUDED.nombre, EXCLUDED.descripcion, EXCLUDED.activo);

SELECT setval('catalogo.resultado_resolucion_id_seq', (SELECT max(id) FROM catalogo.resultado_resolucion));
