// Ids fijos de catalogo.estado_archivo (los fija la migracion). Mantener sincronizado: lo comprueba una prueba de contrato.
export enum EstadoArchivoId {
  RECIBIDO = 1,
  VERIFICANDO = 2,
  VERIFICADO = 3,
  RECHAZADO = 4,
}
