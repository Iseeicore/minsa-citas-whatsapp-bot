export function formatHoraCita(horaInicio: string): string {
  const [hh, mm] = horaInicio.split(":");
  return `${parseInt(hh, 10)}${mm}`;
}

export function formatFechaForApi(fechaCupo: string): string {
  const [day, month, year] = fechaCupo.split("/");
  if (!day || !month || !year) return fechaCupo;
  return `${year}${month}${day}`;
}
