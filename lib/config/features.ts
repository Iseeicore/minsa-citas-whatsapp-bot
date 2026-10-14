/** Registrar y consultar una incidencia solo se ofrecen con INCIDENCIAS_ENABLED=true; sin definir, el bot solo agenda citas. Único lugar que lee la variable. */
export function isIncidenciasEnabled(): boolean {
  return process.env.INCIDENCIAS_ENABLED?.trim().toLowerCase() === "true";
}
