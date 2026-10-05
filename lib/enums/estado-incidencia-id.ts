// Ids fijos de catalogo.estado_incidencia (los fija la migracion). Mantener sincronizado: lo comprueba una prueba de contrato.
export enum EstadoIncidenciaId {
  REGISTRADO = 1,
  CLASIFICADO = 2,
  EN_GESTION = 3,
  RESUELTO = 4,
  /** Retirado: anular una incidencia es su borrado lógico (activo = false). El id se conserva. */
  ANULADO = 5,
  DERIVADO = 6,
  ARCHIVADO = 7,
}
