SELECT set_config('app.actor', 'sistema:semilla', true);

INSERT INTO catalogo.estado_archivo (id, codigo, nombre, descripcion, activo) VALUES
  (1, 'RECIBIDO', 'Recibido', 'Subido por el ciudadano, todavía sin analizar', true),
  (2, 'VERIFICANDO', 'Verificando', 'En análisis: tamaño, firma real del archivo y antivirus', true),
  (3, 'VERIFICADO', 'Verificado', 'Pasó todas las verificaciones', true),
  (4, 'RECHAZADO', 'Rechazado', 'No pasó una verificación; se indica el motivo', true)
ON CONFLICT (id) DO UPDATE SET
  codigo = EXCLUDED.codigo,
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  activo = EXCLUDED.activo
WHERE (estado_archivo.codigo, estado_archivo.nombre, estado_archivo.descripcion, estado_archivo.activo) IS DISTINCT FROM (EXCLUDED.codigo, EXCLUDED.nombre, EXCLUDED.descripcion, EXCLUDED.activo);

SELECT setval('catalogo.estado_archivo_id_seq', (SELECT max(id) FROM catalogo.estado_archivo));
