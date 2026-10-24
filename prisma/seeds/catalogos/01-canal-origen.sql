SELECT set_config('app.actor', 'sistema:semilla', true);

INSERT INTO catalogo.canal_origen (id, codigo, nombre, descripcion, activo) VALUES
  (1, 'WHATSAPP', 'WhatsApp', 'Chatbot de WhatsApp', true),
  (2, 'WEB', 'Web', 'Widget del portal', true)
ON CONFLICT (id) DO UPDATE SET
  codigo = EXCLUDED.codigo,
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  activo = EXCLUDED.activo
WHERE (canal_origen.codigo, canal_origen.nombre, canal_origen.descripcion, canal_origen.activo) IS DISTINCT FROM (EXCLUDED.codigo, EXCLUDED.nombre, EXCLUDED.descripcion, EXCLUDED.activo);

SELECT setval('catalogo.canal_origen_id_seq', (SELECT max(id) FROM catalogo.canal_origen));
