SELECT set_config('app.actor', 'sistema:semilla', true);

INSERT INTO catalogo.motivo_archivo (id, codigo, nombre, descripcion, activo) VALUES
  (1, 'RESUELTA_VIGENCIA', 'Resuelta, vigencia cumplida', 'Resuelta y venció la vigencia de la resolución', true),
  (2, 'VENCIDA_SIN_ATENDER', 'Vencida sin atender', 'Abierta que superó el plazo de atención', true),
  (3, 'DATOS_INSUFICIENTES', 'Datos insuficientes', 'No se puede gestionar por falta de datos: lo archiva el filtro o una persona, con su justificación', true),
  (4, 'NO_CORRESPONDE', 'No corresponde', 'El caso no corresponde a este establecimiento o no es una queja ni un reclamo: lo archiva una persona, con su justificación', true)
ON CONFLICT (id) DO UPDATE SET
  codigo = EXCLUDED.codigo,
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  activo = EXCLUDED.activo
WHERE (motivo_archivo.codigo, motivo_archivo.nombre, motivo_archivo.descripcion, motivo_archivo.activo) IS DISTINCT FROM (EXCLUDED.codigo, EXCLUDED.nombre, EXCLUDED.descripcion, EXCLUDED.activo);

SELECT setval('catalogo.motivo_archivo_id_seq', (SELECT max(id) FROM catalogo.motivo_archivo));
