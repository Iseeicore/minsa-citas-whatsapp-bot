export function isIncidenciasEnabled(): boolean {
  return process.env.INCIDENCIAS_ENABLED?.trim().toLowerCase() === "true";
}
