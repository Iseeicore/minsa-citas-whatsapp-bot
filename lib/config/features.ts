const ENABLED_VALUE = "true";

const isFlagOn = (value: string | undefined): boolean => value?.trim().toLowerCase() === ENABLED_VALUE;

export function isIncidenciasEnabled(): boolean {
  return isFlagOn(process.env.INCIDENCIAS_ENABLED);
}

export function isTerminosEnabled(): boolean {
  return isFlagOn(process.env.TERMINOS_ENABLED);
}
