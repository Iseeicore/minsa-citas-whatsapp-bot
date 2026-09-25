// "08:45" -> "845" — the booking endpoint drops the colon and any leading
// zero on the hour, but keeps a leading zero on the minutes.
export function formatHoraCita(horaInicio: string): string {
  const [hh, mm] = horaInicio.split(":");
  return `${parseInt(hh, 10)}${mm}`;
}

// MINSA's real quotas/dates endpoint returns fecha_cupo as "DD/MM/YYYY"
// (shown to the citizen as-is, e.g. in a list row) but quotas/times and
// appointments require "YYYYMMDD". Idempotent for values already in
// YYYYMMDD (e.g. Sandbox's fakeFechas(), which has no slashes) — those pass
// through unchanged.
export function formatFechaForApi(fechaCupo: string): string {
  const [day, month, year] = fechaCupo.split("/");
  if (!day || !month || !year) return fechaCupo;
  return `${year}${month}${day}`;
}
