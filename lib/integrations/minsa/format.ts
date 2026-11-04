export function formatHoraCita(horaInicio: string): string {
  const [hh, mm] = horaInicio.split(":");
  return `${hh.padStart(2, "0")}${mm}`;
}

export function formatFechaForApi(fechaCupo: string): string {
  const [day, month, year] = fechaCupo.split("/");
  if (!day || !month || !year) return fechaCupo;
  return `${year}${month}${day}`;
}
