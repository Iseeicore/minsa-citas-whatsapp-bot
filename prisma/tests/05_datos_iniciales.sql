\set ON_ERROR_STOP on
\set QUIET on

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

DO $$
BEGIN
  ASSERT (SELECT string_agg(id || ':' || codigo, ',' ORDER BY id) FROM catalogo.tipo_area)
         = '1:ESTABLECIMIENTO,2:OTRANS,3:DIRIS,4:INSTITUTO,5:ORGANISMO', 'D22 tipos de area';
  ASSERT (SELECT string_agg(id || ':' || codigo, ',' ORDER BY id) FROM catalogo.nivel_atencion) = '1:I,2:II,3:III', 'D23 niveles de atencion';
  ASSERT (SELECT string_agg(id || ':' || codigo, ',' ORDER BY id) FROM catalogo.motivo_archivo)
         = '1:RESUELTA_VIGENCIA,2:VENCIDA_SIN_ATENDER,3:DATOS_INSUFICIENTES,4:NO_CORRESPONDE', 'D24 motivos de archivo';
  ASSERT (SELECT string_agg(id || ':' || codigo, ',' ORDER BY id) FROM catalogo.resultado_resolucion)
         = '1:ATENDIDO,2:CERRADO', 'D24b resultados de la resolucion';
END $$;

DO $$
BEGIN
  ASSERT (SELECT string_agg(codigo, ',' ORDER BY id) FROM gestion.rol)
         = 'ADMINISTRADOR,GESTOR,OTRANS,ESTABLECIMIENTO,DIRIS', 'D12 roles';
  ASSERT (SELECT string_agg(codigo, ',' ORDER BY id) FROM gestion.rol WHERE activo) = 'ADMINISTRADOR,GESTOR,OTRANS,ESTABLECIMIENTO',
    'D12 el rol DIRIS nace desactivado';
  ASSERT (SELECT count(*) FROM gestion.usuario_interno) = 0, 'D13 la migracion no crea personas: el primer administrador va aparte';

  ASSERT (SELECT string_agg(r.codigo || '=' || coalesce(ta.codigo, '-'), ',' ORDER BY r.id) FROM gestion.rol r LEFT JOIN catalogo.tipo_area ta ON ta.id = r.tipo_area_id)
         = 'ADMINISTRADOR=-,GESTOR=ESTABLECIMIENTO,OTRANS=OTRANS,ESTABLECIMIENTO=ESTABLECIMIENTO,DIRIS=DIRIS', 'D25 tipo de area de cada rol: solo el administrador no tiene; el gestor pertenece a un establecimiento';

  ASSERT (SELECT string_agg(c.codigo, ',' ORDER BY c.id) FROM gestion.rol_categoria rc
            JOIN gestion.rol r ON r.id = rc.rol_id JOIN catalogo.categoria_incidencia c ON c.id = rc.categoria_incidencia_id
           WHERE r.codigo = 'ADMINISTRADOR') = 'DENUNCIA_CORRUPCION,QUEJA,RECLAMO,OTRO', 'D14 el administrador ve todas las categorias';
  ASSERT (SELECT string_agg(c.codigo, ',' ORDER BY c.id) FROM gestion.rol_categoria rc
            JOIN gestion.rol r ON r.id = rc.rol_id JOIN catalogo.categoria_incidencia c ON c.id = rc.categoria_incidencia_id
           WHERE r.codigo = 'GESTOR') = 'QUEJA,RECLAMO,OTRO', 'D15 el gestor ve lo no sensible';
  ASSERT (SELECT string_agg(c.codigo, ',' ORDER BY c.id) FROM gestion.rol_categoria rc
            JOIN gestion.rol r ON r.id = rc.rol_id JOIN catalogo.categoria_incidencia c ON c.id = rc.categoria_incidencia_id
           WHERE r.codigo = 'OTRANS') = 'DENUNCIA_CORRUPCION', 'D16 OTRANS ve solo corrupcion';
  ASSERT (SELECT string_agg(c.codigo, ',' ORDER BY c.id) FROM gestion.rol_categoria rc
            JOIN gestion.rol r ON r.id = rc.rol_id JOIN catalogo.categoria_incidencia c ON c.id = rc.categoria_incidencia_id
           WHERE r.codigo = 'ESTABLECIMIENTO') = 'QUEJA,RECLAMO,OTRO', 'D17 el establecimiento ve quejas, reclamos y otros (nunca corrupcion)';
  ASSERT (SELECT string_agg(c.codigo, ',' ORDER BY c.id) FROM gestion.rol_categoria rc
            JOIN gestion.rol r ON r.id = rc.rol_id JOIN catalogo.categoria_incidencia c ON c.id = rc.categoria_incidencia_id
           WHERE r.codigo = 'DIRIS') = 'QUEJA,RECLAMO', 'D18 la DIRIS ve quejas y reclamos';
  ASSERT (SELECT string_agg(r.codigo, ',' ORDER BY r.id) FROM gestion.rol_categoria rc
            JOIN gestion.rol r ON r.id = rc.rol_id AND r.activo
           WHERE rc.categoria_incidencia_id = 1) = 'ADMINISTRADOR,OTRANS',
    'D19 la denuncia por corrupcion la ven solo el administrador y OTRANS';
  ASSERT (SELECT count(*) FROM gestion.rol_categoria) = 13, 'D19 en total hay 13 permisos de categoria';
  ASSERT (SELECT usuario_creacion FROM gestion.rol_categoria LIMIT 1) = 'sistema:migracion', 'D20 la migracion firma lo que carga';
END $$;

SELECT set_config('app.actor', 'sistema:migracion', false);
INSERT INTO gestion.rol (id, codigo, nombre, descripcion) VALUES (1, 'ADMINISTRADOR', 'Administrador', 'x')
ON CONFLICT (id) DO UPDATE SET descripcion = EXCLUDED.descripcion;
INSERT INTO gestion.rol_categoria (rol_id, categoria_incidencia_id) VALUES (1, 1) ON CONFLICT (rol_id, categoria_incidencia_id) DO NOTHING;
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM gestion.rol) = 5, 'D21 repetir la carga no duplica roles';
  ASSERT (SELECT count(*) FROM gestion.rol_categoria) = 13, 'D21 repetir la carga no duplica permisos';
END $$;

\echo TODAS LAS PRUEBAS DE DATOS INICIALES PASARON
