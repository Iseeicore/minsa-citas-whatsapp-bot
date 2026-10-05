\set ON_ERROR_STOP on
\set QUIET on

-- Datos de referencia que trae la base desde el primer dia (migraciones). Si alguien cambia un id o un codigo, esta
-- prueba falla: el codigo de la aplicacion (lib/enums/*-id.ts) depende de ellos.
DO $$
BEGIN
  ASSERT (SELECT string_agg(id || ':' || codigo, ',' ORDER BY id) FROM catalogo.categoria_incidencia)
         = '1:DENUNCIA_CORRUPCION,2:QUEJA,3:RECLAMO,4:OTRO', 'D01 categorias de incidencia';
  ASSERT (SELECT string_agg(codigo, ',' ORDER BY id) FROM catalogo.categoria_incidencia WHERE es_sensible) = 'DENUNCIA_CORRUPCION',
    'D02 solo la denuncia por corrupcion es sensible';

  ASSERT (SELECT string_agg(id || ':' || codigo, ',' ORDER BY id) FROM catalogo.estado_incidencia)
         = '1:REGISTRADO,2:CLASIFICADO,3:EN_GESTION,4:RESUELTO,5:ANULADO,6:DERIVADO,7:ARCHIVADO', 'D03 estados de la incidencia';
  ASSERT (SELECT activo FROM catalogo.estado_incidencia WHERE codigo = 'ANULADO') = false, 'D04 ANULADO esta retirado (es el borrado logico)';
  ASSERT (SELECT count(*) FROM catalogo.estado_incidencia WHERE activo) = 6, 'D04 los otros seis estados siguen activos';

  ASSERT (SELECT string_agg(id || ':' || codigo, ',' ORDER BY id) FROM catalogo.estado_archivo)
         = '1:RECIBIDO,2:VERIFICANDO,3:VERIFICADO,4:RECHAZADO', 'D05 estados del archivo';
  ASSERT (SELECT string_agg(id || ':' || codigo, ',' ORDER BY id) FROM catalogo.canal_origen) = '1:WHATSAPP,2:WEB', 'D06 canales';
  ASSERT (SELECT string_agg(id || ':' || codigo, ',' ORDER BY id) FROM catalogo.tipo_evidencia)
         = '1:IMAGEN,2:VIDEO,3:DOCUMENTO,4:AUDIO', 'D07 tipos de evidencia';
  ASSERT (SELECT string_agg(id || ':' || codigo, ',' ORDER BY id) FROM catalogo.direccion_mensaje) = '1:ENTRANTE,2:SALIENTE', 'D08 direccion del mensaje';
  ASSERT (SELECT string_agg(id || ':' || codigo, ',' ORDER BY id) FROM catalogo.estado_conversacion) = '1:ABIERTA,2:CERRADA', 'D09 estados de conversacion';
  ASSERT (SELECT string_agg(id || ':' || codigo, ',' ORDER BY id) FROM catalogo.estado_mensaje)
         = '1:PENDIENTE,2:ENVIADO,3:ENTREGADO,4:LEIDO,5:FALLIDO', 'D10 estados del mensaje';
  ASSERT (SELECT string_agg(id || ':' || codigo, ',' ORDER BY id) FROM catalogo.tipo_mensaje)
         = '1:TEXTO,2:IMAGEN,3:AUDIO,4:DOCUMENTO,5:UBICACION,6:PLANTILLA,7:DESCONOCIDO', 'D11 tipos de mensaje';
END $$;

-- Roles de la plataforma de gestion y que categoria ve cada uno.
DO $$
BEGIN
  ASSERT (SELECT string_agg(codigo, ',' ORDER BY id) FROM gestion.rol)
         = 'ADMINISTRADOR,GESTOR,REVISOR,AREA_DENUNCIA_CORRUPCION,AREA_QUEJA,AREA_RECLAMO', 'D12 roles';
  ASSERT (SELECT count(*) FROM gestion.usuario_interno) = 0, 'D13 la migracion no crea personas: el primer administrador va aparte';

  ASSERT (SELECT string_agg(c.codigo, ',' ORDER BY c.id) FROM gestion.rol_categoria rc
            JOIN gestion.rol r ON r.id = rc.rol_id JOIN catalogo.categoria_incidencia c ON c.id = rc.categoria_incidencia_id
           WHERE r.codigo = 'AREA_DENUNCIA_CORRUPCION') = 'DENUNCIA_CORRUPCION', 'D14 el area de corrupcion ve solo corrupcion';
  ASSERT (SELECT string_agg(c.codigo, ',' ORDER BY c.id) FROM gestion.rol_categoria rc
            JOIN gestion.rol r ON r.id = rc.rol_id JOIN catalogo.categoria_incidencia c ON c.id = rc.categoria_incidencia_id
           WHERE r.codigo = 'AREA_QUEJA') = 'QUEJA', 'D15 el area de quejas ve solo quejas';
  ASSERT (SELECT string_agg(c.codigo, ',' ORDER BY c.id) FROM gestion.rol_categoria rc
            JOIN gestion.rol r ON r.id = rc.rol_id JOIN catalogo.categoria_incidencia c ON c.id = rc.categoria_incidencia_id
           WHERE r.codigo = 'AREA_RECLAMO') = 'RECLAMO', 'D16 el area de reclamos ve solo reclamos';
  ASSERT (SELECT string_agg(r.codigo, ',' ORDER BY r.id) FROM gestion.rol_categoria rc
            JOIN gestion.rol r ON r.id = rc.rol_id AND r.activo
           WHERE rc.categoria_incidencia_id = 1) = 'ADMINISTRADOR,AREA_DENUNCIA_CORRUPCION',
    'D17 la denuncia por corrupcion la ven solo el administrador y su area (no el gestor ni el revisor retirado)';
  ASSERT (SELECT count(*) FROM gestion.rol_categoria rc JOIN gestion.rol r ON r.id = rc.rol_id
           WHERE r.codigo = 'GESTOR' AND rc.categoria_incidencia_id = 4) = 1, 'D18 el gestor ve lo no clasificable para derivarlo';
  ASSERT (SELECT count(*) FROM gestion.rol_categoria rc JOIN gestion.rol r ON r.id = rc.rol_id WHERE r.codigo = 'ADMINISTRADOR') = 4,
    'D19 el administrador ve todas las categorias';
  ASSERT (SELECT usuario_creacion FROM gestion.rol_categoria LIMIT 1) = 'sistema:migracion', 'D20 la migracion firma lo que carga';
END $$;

-- Repetir la carga no duplica nada (las migraciones usan ON CONFLICT).
SELECT set_config('app.actor', 'sistema:migracion', false);
INSERT INTO gestion.rol (id, codigo, nombre, descripcion) VALUES (1, 'ADMINISTRADOR', 'Administrador', 'x')
ON CONFLICT (id) DO UPDATE SET descripcion = EXCLUDED.descripcion;
INSERT INTO gestion.rol_categoria (rol_id, categoria_incidencia_id) VALUES (1, 1) ON CONFLICT (rol_id, categoria_incidencia_id) DO NOTHING;
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM gestion.rol) = 6, 'D21 repetir la carga no duplica roles';
  ASSERT (SELECT count(*) FROM gestion.rol_categoria) = 14, 'D21 repetir la carga no duplica permisos';
END $$;

\echo TODAS LAS PRUEBAS DE DATOS INICIALES PASARON
